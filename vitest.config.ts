import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside the Workers runtime against a throwaway local D1.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Test-only bindings: migrations to apply in setup, and fixed auth
          // settings so tests do not depend on a local .dev.vars file.
          bindings: {
            TEST_MIGRATIONS: migrations,
            SESSION_SECRET: "test-session-secret-0123456789abcdef",
            ADMIN_EMAILS: "admin@example.test",
            GOOGLE_CLIENT_ID: "test-client-id",
            GOOGLE_CLIENT_SECRET: "test-client-secret",
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
