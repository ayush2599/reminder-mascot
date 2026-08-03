import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            rollupOptions: {
              external: ["koffi"],
            },
          },
        },
      },
      preload: {
        input: path.join(configDir, "electron/preload.ts"),
      },
      renderer: {},
    }),
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  build: {
    outDir: "dist/client",
  },
  resolve: {
    alias: {
      "@": path.resolve(configDir, "src"),
      "@shared": path.resolve(configDir, "shared"),
    },
  },
});
