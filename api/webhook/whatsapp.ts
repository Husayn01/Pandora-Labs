import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle Meta Webhook Verification (GET request)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Ensure this matches the verify token you set in your Meta App Dashboard
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Verification failed');
    }
  }

  // Handle incoming WhatsApp messages (POST request)
  if (req.method === 'POST') {
    try {
      const body = req.body;

      // Ensure this is a WhatsApp status update or message
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.value.messages) {
              const message = change.value.messages[0];
              const from = message.from; // Sender's phone number
              
              let messageText = '';
              
              if (message.type === 'text') {
                messageText = message.text.body;
              } else if (message.type === 'audio') {
                // TODO: Handle voice note (download audio, transcribe via Gemini/Whisper)
                messageText = '[Voice note received]';
              }

              console.log(`Received message from ${from}: ${messageText}`);

              // TODO:
              // 1. Find user in Supabase by phone number (`from`)
              // 2. Fetch user's agents
              // 3. Route via Gemini
              // 4. Send reply back using Meta Cloud API
            }
          }
        }
        return res.status(200).send('EVENT_RECEIVED');
      } else {
        return res.status(404).send('Not Found');
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      return res.status(500).send('Internal Server Error');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
