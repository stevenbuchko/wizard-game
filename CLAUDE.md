# Wizard and Dragons

An iPad game Steven is building for his 7-year-old nephew. `README.md` describes the game and the code; `ROADMAP.md` lists what to build next. Steven's project note, with the nephew's requests and picks, is `~/vault/personal/projects/wizard-game.md`.

@~/vault/how-to-work-with-me.md

## A session

1. Build the top item in `ROADMAP.md` that isn't done, unless Steven names another. One feature per session.
2. If the item is waiting on an answer, or its brief no longer matches the code, say so before writing code.
3. Test it in the browser (below) against the item's "Done when".
4. Commit, then push. A push publishes straight to his iPad, so say so before pushing, and push only once the tests pass.
5. Check the deploy. Then mark the item done in `ROADMAP.md` with the date and commit, and add a line under Notes in the vault note. In the vault, commit only that file and never push; Obsidian Git pushes it.

## Git

- The remote is SSH to Steven's personal account (`git@github.com:stevenbuchko/wizard-game.git`), through 1Password, so 1Password must be unlocked to push. This repo's own config commits as `stevenbuchko@gmail.com`.
- Never use `gh` or an HTTPS remote here. Both act as his work account, and work and personal GitHub stay strictly apart (`~/vault/_meta/setup.md`).
- Commit only the files you changed, with a message that says what changed. Never `git add -A`.
- Every push to `main` deploys through `.github/workflows/pages.yml`. Check the run without auth: `curl -s https://api.github.com/repos/stevenbuchko/wizard-game/actions/runs`.

## Testing

Start the dev server with the `wizard-game` preview (`.claude/launch.json`), set the viewport to 1180×820 (an iPad in landscape), and drive the game through `window.game` (README lists the hooks):
- **Seed a save:** `localStorage.setItem('wizard-game-v1', JSON.stringify({friends: [...], stars: [], look: {robe: '#29459e', crystal: '#66e6ff', hat: 'hood', staff: 'wood'}, muted: true, name: ''}))`, then reload. Clear it when done.
- **Press buttons:** dispatch `new PointerEvent('pointerdown', {bubbles: true})` on them. Buttons answer on pointerdown, and clicking by screenshot coordinates has missed before.
- **Walk:** `walkTo` takes a Babylon `Vector3`: `const v = game.wizard.root.position.clone(); v.set(x, 0, z); game.walkTo(v)`. Wait about a second after `travel` before walking, or the walk is lost.
- **No frames:** when the app window isn't on screen, the page gets no animation frames and nothing moves. Render by hand: `const s = game.camera.getScene(), e = s.getEngine(); window.__tick = setInterval(() => { e.beginFrame(); s.render(); e.endFrame(); }, 16)`. `s.render()` alone leaves the frame time at 0. Clear the interval when done.
- **Long scripts:** keep each script under about 40 seconds. Poll `game.mode` in a loop rather than one long wait.

## Code

- Import Babylon only through `src/babylon.ts`, adding exports there. Importing `@babylonjs/core` directly pulls in about 5 MB.
- No words in the game. He may not read yet, so everything is icons, emoji, colors and sounds.
- Nothing is ever a game over. Losing is a nap back at the start.
- Keep the comment style: a line saying why, not what.
- Instances share their source mesh's visibility (`InstancedMesh.visibility` does nothing), which is why `fader` in `src/world.ts` swaps in copies.
