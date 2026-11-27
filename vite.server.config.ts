import { defineConfig } from "vite";

// Bundles the plain-server entry (Node + SQLite) into one file with every
// dependency inlined, so the runtime image needs no installed packages.
export default defineConfig({
  // The client build owns public/; the server bundle is code only.
  publicDir: false,
  build: {
    ssr: "src/server/node-server.ts",
    outDir: "server-build",
    emptyOutDir: true,
    target: "node24",
    rollupOptions: { output: { entryFileNames: "server.mjs" } },
  },
  ssr: { noExternal: true },
});
