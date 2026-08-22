import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'
import path from "path"

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // Vite does not load .env files into process.env for the config file
  // itself (only for import.meta.env in app code), so TAURI_DEV_HOST -- set
  // by `pnpm ascurix init` in apps/desktop/.env.local for multi-instance
  // dev -- has to be pulled in explicitly here.
  // @ts-expect-error process is a nodejs global
  const env = loadEnv(mode, process.cwd(), "");
  // @ts-expect-error process is a nodejs global
  const host = process.env.TAURI_DEV_HOST || env.TAURI_DEV_HOST;

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
