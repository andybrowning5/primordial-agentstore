import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Provide non-secret vars used by handlers under test.
          bindings: {
            SIGNALS_WINDOW_DAYS: '30',
            WRITE_RATE_PER_MIN: '60',
            GITHUB_TOPIC: 'primordial-agent',
            GITHUB_EXTRA_TOPICS: 'primordial-agent-test',
          },
        },
      },
    },
  },
});
