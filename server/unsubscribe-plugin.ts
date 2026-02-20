import type { Plugin, Connect } from 'vite';
import type { ServerResponse } from 'node:http';

function parseJsonBody(req: Connect.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: Record<string, unknown>,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function unsubscribePlugin(): Plugin {
  return {
    name: 'unsubscribe-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        async (
          req: Connect.IncomingMessage,
          res: ServerResponse,
          next: Connect.NextFunction,
        ) => {
          const url = req.url ?? '';

          // POST /api/unsubscribe/one-click
          if (url === '/api/unsubscribe/one-click' && req.method === 'POST') {
            try {
              const body = await parseJsonBody(req);
              const targetUrl = body.url;

              if (!targetUrl || typeof targetUrl !== 'string') {
                sendJson(res, 400, {
                  success: false,
                  method: 'one_click',
                  message: 'Missing or invalid "url" in request body',
                });
                return;
              }

              // RFC 8058 One-Click Unsubscribe: POST with form-encoded body
              const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'List-Unsubscribe=One-Click',
                redirect: 'follow',
              });

              const success = response.ok;
              sendJson(res, 200, {
                success,
                method: 'one_click',
                message: success
                  ? `One-click unsubscribe succeeded (HTTP ${response.status})`
                  : `One-click unsubscribe failed (HTTP ${response.status})`,
              });
            } catch (err) {
              const message =
                err instanceof Error ? err.message : String(err);
              sendJson(res, 500, {
                success: false,
                method: 'one_click',
                message: `One-click unsubscribe error: ${message}`,
              });
            }
            return;
          }

          // POST /api/unsubscribe/headless
          if (url === '/api/unsubscribe/headless' && req.method === 'POST') {
            try {
              const body = await parseJsonBody(req);
              const targetUrl = body.url;

              if (!targetUrl || typeof targetUrl !== 'string') {
                sendJson(res, 400, {
                  success: false,
                  message: 'Missing or invalid "url" in request body',
                  steps: [],
                  finalUrl: '',
                });
                return;
              }

              // Dynamic import to avoid loading puppeteer-core until needed
              const { runHeadlessUnsubscribe } = await import(
                './headless-unsubscribe.js'
              );
              const result = await runHeadlessUnsubscribe(targetUrl);

              sendJson(res, 200, result as unknown as Record<string, unknown>);
            } catch (err) {
              const message =
                err instanceof Error ? err.message : String(err);
              sendJson(res, 500, {
                success: false,
                message: `Headless unsubscribe error: ${message}`,
                steps: [],
                finalUrl: '',
              });
            }
            return;
          }

          // Not our route, pass through
          next();
        },
      );
    },
  };
}
