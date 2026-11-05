# Wizard and Dragons

An iPad game for a 7-year-old. Touch the ground to walk; the wizard finds his way around trees. Walk up to a dragon and a face-off starts. Each dragon is weak to one spell, and three of those make it a friend. The shield blocks the dragon's puff, and losing all three hearts is a nap back at the start, never a game over.

- **Friends** follow him as pets, three at most, and he can ride one with the dragon button. The rest wait in the home, the meadow in the middle of the map, each on its own straw bed, so every dragon out in a world is a wild one. At home he taps a friend to bring it along or send it back to bed; a new friend joins him and the oldest pick flies home. Flying is how he reaches the stars floating over each area. In a face-off, the friends with him puff at the dragon too, weaker than his spells.
- **One big world**: the home is in the middle, and the forest, a snowy mountain (opens at 2 friends), a volcano (opens at 4) and the summit sit around it, with a glowing line on the ground between every two. He walks or flies from one to the next; the sky, fog and colors blend as he crosses. A locked world has a wall of light on its lines and signs showing how many friends it needs. A post at each world's line shows its dragons, lit for each friend. At 8 friends the summit opens: the Dragon King switches from fire to ice to lightning as it calms down (the bar turns that color), takes two strong hits per element, and every friend flies in to help. Befriending it is the ending.
- **His wizard**: the 🧙 button on the title screen picks the robe, crystal, staff, hood or hat, and his name, which titles the start screen.
- **Saved progress**: friends, stars, his wizard's look and name, and the sound setting stay on the iPad between visits.

What's next is in `ROADMAP.md`. Babylon.js, TypeScript and Vite. The characters are placeholder primitives until the rigged 3D models are bought. Everything imports Babylon through `src/babylon.ts`, which keeps the download to about 1.5 MB.

## Adding a dragon from his description

He describes a dragon: its colors, what it breathes, what beats it, where it lives. Add one entry to `DRAGONS` in `src/dragons.ts`; the comment there explains each field. Give it a home spot at least 10 away from the others in its world. If a new dragon pushes the total past what a line asks for, nothing else changes; if it's a new world, add it to `src/areas.ts` with the way it lies from the middle (`at`), and the ring shares itself out among the worlds.

Each world's look (sky, mountains, ground, tufts, trees and the film grade) is data in `src/areas.ts`, which `src/world.ts` paints onto its slice of the map. The layout (the home's size, the slices, where a world's own spots land) is `src/map.ts`. Effects are in `src/effects.ts`, sounds and music in `src/audio.ts` (all synthesized), and the screen overlay in `src/ui.ts` and `index.html`.

## Run

```bash
npm install
npm run dev
```

`npm run dev` listens on the local network, so an iPad on the same Wi-Fi can open `http://<this Mac's IP>:5173` in Safari. When the network blocks that, a Cloudflare quick tunnel works from anywhere: `cloudflared tunnel --url http://localhost:5173` (the dev server already allows `*.trycloudflare.com`).

## Ship

Every push to `main` builds and publishes to https://stevenbuchko.github.io/wizard-game/ through `.github/workflows/pages.yml`. `npm run build` writes the same static site to `dist/`. Served over HTTPS, Share → Add to Home Screen installs it full-screen, and `public/sw.js` keeps it playable offline.

`window.game` exposes `walkTo`, `cast`, `toggleRide`, `travel` (puts him at a world's start), `swap` (a friend, at home), `dragons`, `wizard`, `data`, `world`, `currentArea` (where he is now), `mode`, `camera`, `quality` (the level of finish the startup probe settled on, 0 is the finest) and `film` (`film.quality(n)` sets one) for play-testing from the console.

A slow device draws less finely: at startup the game times its first frames, and under about 45 fps it steps down a level (`QUALITY` in `src/world.ts`), from 1.5 screen pixels per point with 4× smoothing to 1.25 with FXAA, then 1. The film look stays at every level. `localStorage.clear()` resets progress.
