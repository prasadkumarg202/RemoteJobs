import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const engine = fileURLToPath(new URL("./supabase/functions/_shared/engine/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@engine$/, replacement: `${engine}index.ts` },
      { find: /^@engine\/(.*)$/, replacement: `${engine}$1` },
      // Server-only modules are exercised directly in tests.
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("./", import.meta.url)) + "$1" },
    ],
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
