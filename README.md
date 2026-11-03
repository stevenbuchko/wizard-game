# Wizard and Dragons

An iPad game for a 7-year-old. Touch the ground to walk; walk up to a dragon and a face-off starts. Each dragon is weak to one spell: ice beats the bronze fire dragon, lightning beats the frost dragon, fire beats the green storm dragon. Three strong spells make it a friend, and it follows you. The shield blocks the dragon's puff. Losing all three hearts is a nap back at the start, never a game over.

Babylon.js, TypeScript and Vite. The characters are placeholder primitives until the rigged 3D models are bought.

## Run

```bash
npm install
npm run dev
```

`npm run dev` listens on the local network, so an iPad on the same Wi-Fi can open `http://<this Mac's IP>:5173` in Safari.

## Ship

`npm run build` writes a static site to `dist/`, which works from any static host path. Served over HTTPS, Share → Add to Home Screen installs it full-screen, and `public/sw.js` keeps it playable offline.

`window.game` exposes `walkTo`, `cast`, `dragons` and `wizard` for play-testing from the console.
