import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Supabase Client (Service Role for DB operations, but we verify user JWT)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversationId, userId } = req.body;
    const authHeader = req.headers.authorization;

    if (!message || !userId || !authHeader) {
      return res.status(400).json({ error: 'Missing message, userId, or auth header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user || user.id !== userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let activeConversationId = conversationId;

    // Create conversation if it doesn't exist
    if (!activeConversationId) {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          channel: 'web'
        })
        .select()
        .single();
      
      if (convError) throw convError;
      activeConversationId = conv.id;
    }

    // Save user message
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversationId,
        sender_type: 'user',
        content: message,
      });
      
    if (msgError) throw msgError;

    // Fetch user's installed agents
    const { data: userAgents, error: agentsError } = await supabase
      .from('user_agents')
      .select(`
        id, custom_system_prompt, is_active,
        catalog:catalog_agent_id (
          id, slug, name, description, category, icon, type, capabilities, default_system_prompt
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (agentsError) throw agentsError;

    // Format agents for the router prompt
    const availableAgents = (userAgents || []).map((ua: any) => ({
      user_agent_id: ua.id,
      slug: Array.isArray(ua.catalog) ? ua.catalog[0]?.slug : ua.catalog?.slug,
      name: Array.isArray(ua.catalog) ? ua.catalog[0]?.name : ua.catalog?.name,
      description: Array.isArray(ua.catalog) ? ua.catalog[0]?.description : ua.catalog?.description,
      capabilities: Array.isArray(ua.catalog) ? ua.catalog[0]?.capabilities : ua.catalog?.capabilities,
      icon: Array.isArray(ua.catalog) ? ua.catalog[0]?.icon : ua.catalog?.icon,
      system_prompt: ua.custom_system_prompt || (Array.isArray(ua.catalog) ? ua.catalog[0]?.default_system_prompt : ua.catalog?.default_system_prompt),
    })).filter(a => a.slug !== 'pandora-router'); // Exclude router itself from choices

    // Configure Gemini Router
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      systemInstruction: `You are the Pandora Router Agent. Your job is to analyze the user's message and decide which installed specialist agent should handle it.
      
Available specialist agents:
${JSON.stringify(availableAgents, null, 2)}

If the user's request matches an agent's capabilities, route the request to that agent and generate the response AS IF YOU WERE THAT AGENT.
If no agent matches, or if it's a general conversation, route it to "pandora-router" and answer generally.

You must respond with valid JSON in this exact format:
{
  "routed_to_slug": "agent-slug",
  "reasoning": "Why you chose this agent",
  "response": "The actual response to the user's message"
}`
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const responseText = result.response.text();
    let routerDecision;
    try {
      routerDecision = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', responseText);
      routerDecision = {
        routed_to_slug: 'pandora-router',
        reasoning: 'Failed to parse routing decision',
        response: responseText
      };
    }

    // Find matched agent
    const matchedAgent = availableAgents.find(a => a.slug === routerDecision.routed_to_slug);
    
    let userAgentId = null;
    let agentName = 'Pandora Router';
    let agentIcon = 'Shield';

    if (matchedAgent) {
      userAgentId = matchedAgent.user_agent_id;
      agentName = matchedAgent.name;
      agentIcon = matchedAgent.icon;

      // Increment messages handled for this agent
      await supabase.rpc('increment_messages_handled', { row_id: userAgentId });
    }

    // Save agent response
    const { error: replyError } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversationId,
        user_agent_id: userAgentId,
        sender_type: 'agent',
        content: routerDecision.response,
      });

    if (replyError) throw replyError;

    return res.status(200).json({ 
      reply: routerDecision.response,
      routedTo: routerDecision.routed_to_slug,
      reasoning: routerDecision.reasoning,
      agentName,
      agentIcon,
      conversationId: activeConversationId
    });

  } catch (error: any) {
    console.error('Error in chat API:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
