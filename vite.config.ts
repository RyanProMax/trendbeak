import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  if (mode === "client") {
    return {
      base: "/static/",
      plugins: [react()],
      build: {
        outDir: "dist/static",
        emptyOutDir: true,
        copyPublicDir: false,
        rollupOptions: {
          input: "src/client.tsx",
          output: {
            entryFileNames: "client.js",
            chunkFileNames: "chunks/[name]-[hash].js",
            assetFileNames: (asset) =>
              asset.names.some((name) => name.endsWith(".css"))
                ? "client.css"
                : "assets/[name]-[hash][extname]",
          },
        },
      },
    };
  }

  return {
    // This project exports one Worker and already owns public/_routes.json.
    // Bundle it directly, without a generated second Hono/SmartRouter wrapper.
    plugins: [react()],
    ssr: { noExternal: true, target: "webworker" },
    build: {
      outDir: "dist",
      ssr: "src/worker.tsx",
      minify: true,
      rollupOptions: { output: { entryFileNames: "_worker.js" } },
      emptyOutDir: true,
      copyPublicDir: true,
      target: "es2022",
    },
  };
});
