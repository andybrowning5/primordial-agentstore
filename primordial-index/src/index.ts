// Worker entrypoint: HTTP API (fetch) + scheduled crawler (scheduled).

import type { Env } from './types';
import { handleRequest } from './api';
import { crawl } from './crawler';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(req, env);
    } catch (e) {
      console.error('request error', e);
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      crawl(env)
        .then((r) => console.log('crawl complete', JSON.stringify(r)))
        .catch((e) => console.error('crawl failed', e)),
    );
  },
};
