import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import type { VercelRequest, VercelResponse } from './vercel-types';

type Route = {
  pattern: RegExp;
  modulePath: string;
  params?: string[];
  rawBody?: boolean;
};

const routes: Route[] = [
  { pattern: /^\/api\/chat\/?$/, modulePath: '/api/chat.ts' },
  { pattern: /^\/api\/plans\/?$/, modulePath: '/api/plans.ts' },
  { pattern: /^\/api\/approvals\/([^/]+)\/decision\/?$/, modulePath: '/api/approvals/[id]/decision.ts', params: ['id'] },
  { pattern: /^\/api\/billing\/initialize\/?$/, modulePath: '/api/billing/initialize.ts' },
  { pattern: /^\/api\/channels\/phone-link\/?$/, modulePath: '/api/channels/phone-link.ts' },
  { pattern: /^\/api\/connectors\/google\/?$/, modulePath: '/api/connectors/google.ts' },
  { pattern: /^\/api\/voice\/action\/?$/, modulePath: '/api/voice/action.ts' },
  { pattern: /^\/api\/voice\/init\/?$/, modulePath: '/api/voice/init.ts' },
  { pattern: /^\/api\/voice\/signed-url\/?$/, modulePath: '/api/voice/signed-url.ts' },
  { pattern: /^\/api\/webhooks\/elevenlabs\/?$/, modulePath: '/api/webhooks/elevenlabs.ts', rawBody: true },
  { pattern: /^\/api\/webhooks\/paystack\/?$/, modulePath: '/api/webhooks/paystack.ts', rawBody: true },
];

const MAX_BODY_BYTES = 1_000_000;

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > MAX_BODY_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function parseBody(raw: Buffer, contentType: string | undefined): unknown {
  if (!raw.length) return undefined;
  const text = raw.toString('utf8');
  if (contentType?.includes('application/json')) return JSON.parse(text);
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return text;
}

function parseCookies(header: string | undefined) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const separator = part.indexOf('=');
      const key = separator >= 0 ? part.slice(0, separator).trim() : part.trim();
      const value = separator >= 0 ? part.slice(separator + 1).trim() : '';
      return [key, decodeURIComponent(value)];
    }),
  );
}

function addResponseHelpers(response: ServerResponse): VercelResponse {
  const res = response as VercelResponse;
  res.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (body: unknown) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body: unknown) => {
    if (Buffer.isBuffer(body) || typeof body === 'string') res.end(body);
    else res.json(body);
    return res;
  };
  res.redirect = (statusOrUrl: number | string, target?: string) => {
    const status = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
    const location = typeof statusOrUrl === 'string' ? statusOrUrl : target;
    res.statusCode = status;
    if (location) res.setHeader('Location', location);
    res.end();
    return res;
  };
  return res;
}

function queryFromUrl(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const existing = query[key];
    query[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return query;
}

async function handleApiRequest(server: ViteDevServer, request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || '/', 'http://localhost');
  const route = routes.find((candidate) => candidate.pattern.test(url.pathname));
  const res = addResponseHelpers(response);
  if (!route) return res.status(404).json({ error: 'API route not found.' });

  const match = url.pathname.match(route.pattern);
  const req = request as VercelRequest;
  req.query = queryFromUrl(url);
  route.params?.forEach((name, index) => { req.query[name] = decodeURIComponent(match?.[index + 1] || ''); });
  req.cookies = parseCookies(request.headers.cookie);

  if (!route.rawBody && request.method !== 'GET' && request.method !== 'HEAD') {
    const raw = await readBody(request);
    req.body = parseBody(raw, request.headers['content-type']);
  }

  const module = await server.ssrLoadModule(route.modulePath);
  if (typeof module.default !== 'function') {
    return res.status(500).json({ error: 'API handler is not configured.' });
  }
  await module.default(req, res);
}

export function vercelApiDevPlugin(): Plugin {
  return {
    name: 'pandora-vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        void handleApiRequest(server, req, res).catch((error: unknown) => {
          console.error('[vite-api] request failed', {
            method: req.method,
            url: req.url,
            error: error instanceof Error ? error.message : String(error),
          });
          if (res.headersSent) return res.end();
          const status = error instanceof SyntaxError
            ? 400
            : error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE'
              ? 413
              : 500;
          addResponseHelpers(res).status(status).json({
            error: status === 400
              ? 'Request body must be valid JSON.'
              : status === 413
                ? 'Payload too large.'
                : 'Local API request failed.',
          });
        });
      });
    },
  };
}
