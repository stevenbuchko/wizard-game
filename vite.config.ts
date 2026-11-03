import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from any static host path, such as GitHub Pages.
  base: "./",
  // Lets a Cloudflare quick tunnel reach the dev server, for play-testing on an iPad off this network.
  server: { allowedHosts: [".trycloudflare.com"] },
});
