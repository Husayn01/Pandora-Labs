import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  createSupabaseAdminClient,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../server/api-utils';

interface CatalogAgent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  type: string;
  capabilities: string[] | null;
  default_system_prompt: string | null;
}

interface UserAgentRecord {
  id: string;
  custom_system_prompt: string | null;
  is_active: boolean;
  catalog: CatalogAgent | CatalogAgent[] | null;
}

function getCatalog(catalog: CatalogAgent | CatalogAgent[] | null): CatalogAgent | null {
  return Array.isArray(catalog) ? catalog[0] ?? null : catalog;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { user } = await requireAuthenticatedUser(req, supabase);
    const { message, conversationId, userId } = req.body as {
      message?: string;
      conversationId?: string;
      userId?: string;
    };

    if (!message?.trim()) {
      throw new HttpError(400, 'Missing message');
    }

    if (userId && user.id !== userId) {
      throw new HttpError(401, 'Unauthorized');
    }

    let activeConversationId = conversationId;

    if (activeConversationId) {
      const { data: existingConversation, error: conversationLookupError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', activeConversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (conversationLookupError) throw conversationLookupError;
      if (!existingConversation) throw new HttpError(404, 'Conversation not found');
    } else {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: message.trim().substring(0, 50) + (message.trim().length > 50 ? '...' : ''),
          channel: 'web',
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
        content: message.trim(),
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
    const availableAgents = ((userAgents || []) as UserAgentRecord[])
      .map((ua) => {
        const catalog = getCatalog(ua.catalog);
        return {
          user_agent_id: ua.id,
          slug: catalog?.slug,
          name: catalog?.name,
          description: catalog?.description,
          capabilities: catalog?.capabilities,
          icon: catalog?.icon,
          system_prompt: ua.custom_system_prompt || catalog?.default_system_prompt,
        };
      })
      .filter((agent) => agent.slug && agent.slug !== 'pandora-router');

    if (!process.env.GEMINI_API_KEY) {
      throw new HttpError(500, 'Gemini API key is not configured.');
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
        response: responseText,
      };
    }

    // Find matched agent
    const matchedAgent = availableAgents.find(a => a.slug === routerDecision.routed_to_slug);
    
    let userAgentId = null;
    let agentName = 'Pandora Router';
    let agentIcon = 'Shield';

    if (matchedAgent) {
      userAgentId = matchedAgent.user_agent_id;
      agentName = matchedAgent.name || agentName;
      agentIcon = matchedAgent.icon || agentIcon;

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

  } catch (error) {
    return sendError(res, error);
  }
}
