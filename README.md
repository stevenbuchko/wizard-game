# Wizard and Dragons

An iPad game for a 7-year-old. Touch the ground to walk; the wizard finds his way around trees. Walk up to a dragon and a face-off starts. Each dragon is weak to one spell, and three of those make it a friend. The shield blocks the dragon's puff, and losing all three hearts is a nap back at the start, never a game over.

- **Friends** follow him (the three most recent; the rest wait at home) and he can ride one with the dragon button. Flying is how he reaches the stars floating over each area.
- **Areas**: the forest, then a snowy mountain (opens at 2 friends) and a volcano (opens at 4), through portals. Locked portals show how many friends they need.
- **Saved progress**: friends, stars, his wizard's look and the sound setting stay on the iPad between visits.
- **His wizard**: the 🧙 button on the title screen picks the robe, crystal and hat.

Babylon.js, TypeScript and Vite. The characters are placeholder primitives until the rigged 3D models are bought. Everything imports Babylon through `src/babylon.ts`, which keeps the download to about 1.4 MB.

## Adding a dragon from his description

He describes a dragon: its colors, what it breathes, what beats it, where it lives. Add one entry to `DRAGONS` in `src/dragons.ts`; the comment there explains each field. Give it a home spot at least 10 away from the others in its area and from the portals in `src/areas.ts`. If a new dragon pushes the total past what a portal asks for, nothing else changes; if it's a new area, add it to `src/areas.ts` with a portal to it.

Effects are in `src/effects.ts`, sounds and music in `src/audio.ts` (all synthesized), and the screen overlay in `src/ui.ts` and `index.html`.

## Run

```bash
npm install
npm run dev
```

`npm run dev` listens on the local network, so an iPad on the same Wi-Fi can open `http://<this Mac's IP>:5173` in Safari. When the network blocks that, a Cloudflare quick tunnel works from anywhere: `cloudflared tunnel --url http://localhost:5173` (the dev server already allows `*.trycloudflare.com`).

## Ship

`npm run build` writes a static site to `dist/`, which works from any static host path. Served over HTTPS, Share → Add to Home Screen installs it full-screen, and `public/sw.js` keeps it playable offline.

`window.game` exposes `walkTo`, `cast`, `toggleRide`, `travel`, `dragons`, `wizard`, `data`, `area` and `camera` for play-testing from the console. `localStorage.clear()` resets progress.
