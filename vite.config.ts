import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from any static host path, such as GitHub Pages.
  base: "./",
  // Top-level await, so the kit's trees are loaded before the world is built. Safari has it from 15.
  build: { target: "es2022" },
  // Lets a Cloudflare quick tunnel reach the dev server, for play-testing on an iPad off this network.
  server: { allowedHosts: [".trycloudflare.com"] },
});
