import { defineConfig } from "vite";

import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { geminiDevPlugin } from "./functions/dev-gemini.js";
import { adminDevPlugin } from "./functions/dev-admin.js";
import { firebaseConfig } from "./src/firebase/config.js";

export default defineConfig(({ mode }) => ({
  plugins: [geminiDevPlugin(loadEnv(mode, process.cwd(), ""), firebaseConfig), adminDevPlugin(loadEnv(mode, process.cwd(), ""), firebaseConfig)],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        restablecer: fileURLToPath(new URL("./restablecer.html", import.meta.url))
      }
    }
  }
}));
