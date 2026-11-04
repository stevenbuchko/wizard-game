# Wizard and Dragons

An iPad game for a 7-year-old. Touch the ground to walk; the wizard finds his way around trees. Walk up to a dragon and a face-off starts. Each dragon is weak to one spell, and three of those make it a friend. The shield blocks the dragon's puff, and losing all three hearts is a nap back at the start, never a game over.

- **Friends** follow him (the three most recent; the rest wait at home, with a 💛 overhead so they never look wild) and he can ride one with the dragon button. Flying is how he reaches the stars floating over each area. In a face-off, the friends with him puff at the dragon too, weaker than his spells.
- **Areas**: the forest, then a snowy mountain (opens at 2 friends) and a volcano (opens at 4), through portals. Locked portals show how many friends they need. At 8 friends the summit opens: the Dragon King switches from fire to ice to lightning as it calms down (the bar turns that color), takes two strong hits per element, and every friend flies in to help. Befriending it is the ending.
- **His wizard**: the 🧙 button on the title screen picks the robe, crystal, staff, hood or hat, and his name, which titles the start screen.
- **Saved progress**: friends, stars, his wizard's look and name, and the sound setting stay on the iPad between visits.

What's next is in `ROADMAP.md`. Babylon.js, TypeScript and Vite. The characters are placeholder primitives until the rigged 3D models are bought. Everything imports Babylon through `src/babylon.ts`, which keeps the download to about 1.4 MB.

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

Every push to `main` builds and publishes to https://stevenbuchko.github.io/wizard-game/ through `.github/workflows/pages.yml`. `npm run build` writes the same static site to `dist/`. Served over HTTPS, Share → Add to Home Screen installs it full-screen, and `public/sw.js` keeps it playable offline.

`window.game` exposes `walkTo`, `cast`, `toggleRide`, `travel`, `dragons`, `wizard`, `data`, `area` and `camera` for play-testing from the console. `localStorage.clear()` resets progress.
