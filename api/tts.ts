import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createSupabaseAdminClient,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../server/api-utils';

/**
 * TTS Proxy — ElevenLabs
 * ───────────────────────
 * Proxies text-to-speech requests to ElevenLabs so the API key
 * stays server-side. Returns audio/mpeg directly.
 *
 * POST /api/tts
 * Body: { text: string, voiceId?: string }
 *
 * Default voice: "Sarah" (EXAVITQu4vr4xnSDxMaL) — warm, natural, conversational.
 */

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createSupabaseAdminClient();
    await requireAuthenticatedUser(req, supabase);

    const { text, voiceId = DEFAULT_VOICE_ID } = req.body as {
      text?: string;
      voiceId?: string;
    };
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!text?.trim()) {
      throw new HttpError(400, 'Missing text parameter');
    }

    if (text.length > 1500) {
      throw new HttpError(400, 'Text is too long for text-to-speech.');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(voiceId)) {
      throw new HttpError(400, 'Invalid voice ID.');
    }

    if (!apiKey) {
      console.error('ELEVENLABS_API_KEY is not configured');
      return res.status(500).json({
        error: 'not_configured',
        message: 'ElevenLabs API key is not configured on the server.',
      });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.85,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`ElevenLabs ${response.status}:`, errorBody);

      // Classify errors for the client
      if (response.status === 401) {
        return res.status(500).json({ error: 'invalid_key', message: 'ElevenLabs API key is invalid.' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'quota_exceeded', message: 'ElevenLabs free tier quota exceeded for this month.' });
      }
      return res.status(response.status).json({
        error: 'elevenlabs_error',
        message: `ElevenLabs returned ${response.status}`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache identical phrases for 24h
    return res.status(200).send(buffer);
  } catch (error) {
    return sendError(res, error);
  }
}
