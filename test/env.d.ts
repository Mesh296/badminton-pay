import type { D1Migration } from "cloudflare:test";

// Test-only binding injected by vitest.config.ts; `env` from "cloudflare:workers"
// is typed as Cloudflare.Env.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
