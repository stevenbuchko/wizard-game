# Roadmap

Features to build, in order. Each session builds the top item that isn't done, following `CLAUDE.md`. When one ships, mark it done here with the date and commit, and move anything learned into the item it affects.

New ideas, his or Steven's, go in as a new item where they rank. Write each one so a session that knows nothing else can build it.

## 1. Look pass: lighting and the world

**Status:** done 2026-11-04 (`a501268`)

**Why:** he wants it to look better (Steven, 2026-11-04). This pass changes every frame and none of it is replaced if real models are bought later, so it goes first.

**Build:**
- **Film finish:** a `DefaultRenderingPipeline` with ACES tone mapping, bloom on spells and crystals, anti-aliasing, a light vignette, and a color grade per area.
- **Sky:** a gradient sky dome per area with a sun glow, and a ring of distant mountain silhouettes on the horizon, instead of a flat clear color fading into fog.
- **Ground:** procedural textures instead of one flat color: grass with dirt patches in the forest, sparkling snow, cracked ash with glowing seams in the volcano, crystal stone on the summit. Scatter grass tufts or the area's equivalent.
- **Trees:** layered crowns, a slight color difference per tree (per-instance color), and a gentle sway.

Keep the fade in `fader` (`src/world.ts`) working with any new tree meshes.

**Done when:** every area has been seen in the browser at 1180×820, before-and-after screenshots are in the wrap-up, the frame rate holds, and the download stays under about 2 MB.

## 2. Swap in the bought dragon and wizard

**Status:** waiting on Steven, who is buying both now (2026-11-04). Before this is ready he:
1. asks each seller, through their Unity Asset Store page, whether a free web game may ship the model packed, with the file kept out of the public repo. Not asked (Steven, 2026-11-04), so the license question is open;
2. buys both;
3. puts the two `.unitypackage` downloads somewhere outside this repo and tells the session where.

Agree the hosting plan below with him before writing code.

**Why:** the characters are what he looks at most, and they're still primitives. The shortlist he picked from, with prices, licenses and the other options: https://claude.ai/artifact/RPZvxT7K3jKgoBq2NiGwga. These models replace the primitive characters entirely, so the earlier plan to sculpt better primitives is dropped.

**The models:**
- **Dragon: Toon Dragons by SPiN AG**, $7.99 (https://assetstore.unity.com/packages/3d/characters/creatures/toon-dragons-189520). One four-legged, bat-winged dragon:
  - About 30k triangles; texture size not listed.
  - Hand-painted red, blue and green skins.
  - 10 clips: Idle, Walk_WingsDown, Walk_WingsUp, WingsFlap, Attack, Bow, Fallback, Fly, HeadTurn_Left, HeadTurn_Right. No fire breath or roar.
  - One model becomes all nine dragons.
- **Wizard: Hand Painted Wizard by Artcitizen**, $10 (https://assetstore.unity.com/packages/3d/characters/humanoids/fantasy/hand-painted-wizard-94781):
  - Blue robe, pointed hat, beard, staff.
  - 3,664 triangles, one 2048 diffuse texture.
  - 7 clips: idle1, idle2, walk, run, attack, cast, die.
- Bone names for either weren't listed before purchase.

**Hosting (license):** both are under the Unity Asset Store EULA. It allows any engine but not shipping a model "in a way that allows others to extract them". The source files must never be committed to this public repo, and the site must not serve a plain `.glb` or `.fbx`.

Agreed with Steven, 2026-11-04 (no private repo or deploy key):
- The downloads and the converted models live in `~/wizard-game-models`, outside any git repo. They can be downloaded again from his Unity account.
- A script run on the Mac converts, trims and packs them into one scrambled binary, which is committed like `public/nature/nature.bin`. It holds exactly what the site serves, so committing it exposes nothing more. The game unscrambles it in memory.
- Changing the models means repacking on a Mac with that folder and Blender.

Packing doesn't make extraction impossible, so the sellers' replies decide whether this is enough.

**Build:**
- **Convert:**
  - A `.unitypackage` is a gzipped tar: each asset sits in a GUID folder holding `asset` and `pathname`.
  - Pull out the FBX files and textures, then export GLB with headless Blender (`blender -b --python`).
  - Bring textures down to 1K–2K, and trim the dragon toward 15k triangles. The game is already slow on the iPad (item 8), and up to nine dragons can be on screen.
- **Load:**
  - Add the glTF loader through `src/babylon.ts`, never `@babylonjs/core` directly. Check its cost to the download.
  - Use `instantiateModelsToScene` so each dragon gets its own skeleton and animation groups.
- **Keep the handles** `src/main.ts` drives (`root`, `head`, `wings`, `skin`, `heart`, `crystal`):
  - `head` and `wings` become the head and wing bones' transform nodes.
  - Code that turns them must blend with the clips, not fight them.
  - Pet scaling, the saddle maths in `toggleRide`/`dismount`, and `fader` (copies, since instances share visibility) all need re-checking.
- **Moves:**

  | Need | Clip |
  |---|---|
  | idle | Idle |
  | walk | Walk_WingsDown |
  | fly | Fly / WingsFlap |
  | fire breath | Attack plus the game's particle breath from the head bone |
  | hurt | Fallback |
  | roar | WingsFlap with the head raised in code |
  | befriended or greeting | Bow |
- **Nine colors** from `src/dragons.ts`:
  - Start from the red skin for red-bronze and deep red, the blue for ice, and the green for green.
  - Tint or hue-shift for the rest; if grey, white and gold come out muddy, paint one body/belly/wing mask.
  - The black dragon's lava belly is an emissive map, and the King's crown is a mesh on the head bone.
- **Wizard:**
  - The robe and crystal picker needs the robe masked once on the diffuse.
  - The staff hangs on the hand bone with the crystal at its tip.
  - The hat options either replace the model's hat or ride on the head bone.
  - Hurt and a cheer can come from Mixamo, which needs Steven's Adobe login.

**Done when:**
- In the browser at 1180×820, every dragon in all nine colors and the wizard look right from the play camera, the face-off camera and the wardrobe close-up.
- Every move above plays.
- Riding, pets, the dragon home and the King's battle work.
- The frame rate meets item 8's target.
- Neither the repo nor the deployed site holds a plain model file.
- The download size is agreed with Steven, since it will pass the old 2 MB budget.

## 3. Pet-size friends

**Status:** done 2026-11-04 (`aa5d443`)

**Why:** Steven, 2026-11-03: with several friends following, "they take up a lot of the screen and make it hard to move." The camera sits behind the wizard, and full-size dragons beside him fill the frame and hide the ground he taps on.

**As built:** pets hover off his left and right shoulders as the camera sees them, not behind him: behind him put them between him and the camera. Only the dragon he rides grows; the rest fly beside it as pets.

**Build:** friends that follow him shrink to about 40% and fly at about shoulder height a little behind him, wings flapping, like pets. They grow back to full size, smoothly over about half a second, when:
- he rides one (only the one he rides, or all of them while flying, whichever looks better)
- a face-off starts, since friends help in battles (`updateBattle` and `friendHelp` in `src/main.ts`)

They shrink again afterwards. Friends waiting at home stay full size. The Dragon King's battle on the summit, where every friend flies in, still has them arrive full size.

The size lives on `d.root.scaling`, which is `1.3 × spec.size` today (`makeDragon` in `src/characters.ts`). The saddle maths in `toggleRide` and `dismount` divides by that scale, so riding needs checking after the change.

**Done when:**
- With 3 friends following in the forest, at least half the screen around the wizard is clear while walking.
- He can still tap the ground anywhere around him.
- Riding, a face-off and the summit battle all show full-size dragons.
- Tested at 1180×820 in the browser.

## 4. Dragons left in each world

**Status:** done 2026-11-04 (`ae4bc3f`)

**As built:** the row sits inside the top of each portal's ring, not over it: the play camera looks down, so anything above the ring is off the top of the screen until he's far away, and the friends-needed sign there is mostly unseen too. The row is dark and edged in the destination's portal color, each dragon tinted its own body color; one still to find is a dim shadow. In the corner it sits under the sound button. The drawing is one function, `drawTally` in `src/tally.ts`, on a plain canvas, so item 5 can put it on the region lines. Signs carry `metadata.sign` so the glow layer treats them as blockers; before, the white sign bloomed into a blob.

**Why:** Steven, 2026-11-04: a marker for how many dragons are left at each level. Nothing in the game shows it today, so he can't tell whether a world is finished without walking all of it. A full map was ruled out for now: item 5 replaces the portals with one map, so a map of the portal layout would be thrown away, while these markers carry over.

**Build:** no words, only dragon icons, in the style of the locked-portal signs (`drawSign` in `src/world.ts`: one dragon per friend needed, lit for each friend he has).
- **Over each portal:** a row with one small dragon per dragon living in that world (`area` in `src/dragons.ts`), lit for each one he has befriended. Open and locked portals both get it; on a locked portal it sits with the existing friends-needed sign without the two being confused (a different color, or the world's dragons tinted in their own colors). Portals back to the forest show the forest's count. The home portal gets none.
- **Inside a world:** the same row in a screen corner, beside the mute button (`src/ui.ts`), for the world he's in. A dragon lights up with a small pop when he befriends it. Hidden in the home.
- When every dragon in a world is a friend, the row turns gold or gets a star, so "done" reads at a glance.

Update the rows when a face-off is won and when a save loads.

**Done when:** in the browser at 1180×820, with a seeded save of 2 forest friends and 1 snow friend: the forest shows 2 of 3 lit, the snow portal 1 of 3, the volcano portal 0 of 2, the summit 0 of 1; winning a face-off lights one more without a reload; a finished world shows its done look; nothing on screen uses words.

## 5. One big world

**Status:** done 2026-11-04 (`407affc`)

**As built:** the home is a round meadow of radius 34 in the middle of the map, and each world is a quarter of the ring around it out to 118: forest +z, volcano +x, summit -z, snow -x (`at` in `src/areas.ts`; the layout is `src/map.ts`). Each world's dragon spots and stars keep their old coordinates, mapped onto its slice with -z toward the middle, so star ids and saves carry over. The home fades into each world over its outer 10 m, ground and trees both. A glowing line rings the home and runs between neighbouring worlds; he can walk straight from one world into the next. A locked world has a wall of light in its color on all its lines, 🔒 signs at its home line and halfway along each side, and walking or flying into it stops him with the 🔒 banner. Each world's dragons-left row stands on a post just inside the home at its line. Friends not following him fly back to their beds across the map; on the summit, every friend follows, so they fly to him there. Look blends by sampling regions in a 10 m ring around the camera target and easing. The shadow map is a fixed 72 m box that follows him, with only trees within 32 m casting; trees, rocks and sprinkles past the haze are hidden by a null LOD. In the browser at 1180×820, a GPU-synced frame costs 5.3 to 6.6 ms against 4.1 to 5.9 ms for the portal areas at the same spots, and startup is about 0.3 s against 0.1 s. Not checked on the iPad itself. The King's 🔒 sign used to cut off after five dragons; it now fits eight.

**Why:** his words, 2026-11-03: "Where there are all the worlds around it, just one line to separate all the worlds, and then one big world in the middle." Claude's reading (unconfirmed): one continuous map instead of portals, with the worlds side by side, a visible line on the ground between them, and a bigger world in the centre with the others around it.

**The middle:** Steven, 2026-11-04: "where the dragons are kept and/or a mix of all world areas". So the middle region is the dragon home (item 6: the meadow with straw beds, tapping to choose followers), with its edges blending into each neighbouring world's ground and trees. He said "and/or", so either half alone is acceptable if both together don't look right.

**Build:** replace the portal areas (`src/areas.ts`, `buildArea` in `src/world.ts`, `enterArea` and `travel` in `src/main.ts`) with one map holding every region. The dragons-left rows (item 4) move from the portals to each region's line: `drawTally` in `src/tally.ts` draws one onto any canvas. Each region keeps its own ground color, trees, sprinkles and dragons. Locked regions (2, 4 and 8 friends today) need a barrier at their line, showing the friends it needs the way locked portal signs do now. Sky and fog change as he crosses into a region. Collected stars keep their ids, so saved progress survives.

Things to watch:
- `PathGrid` covers ±60 today and needs to cover the whole map.
- The shadow map is 1024 px over a much bigger area.
- Every dragon is in the scene at once, so `updatePresence` changes.
- The map is about four times the area, so check the frame rate in the browser before calling it done.
- Sky, mountains, fog and the film grade are set per area on arrival (`buildSky` and `setupFilm` in `src/world.ts`, values in `src/areas.ts`). One map needs them blended as he crosses a line, and the ground texture and tufts painted per region.

**Done when:** he can walk from the middle into every unlocked world without a loading fade, locked lines stop him and say why, the King still needs 8 friends, an old save loads with its friends and stars, and the frame rate holds.

## 6. Dragon home

**Status:** done 2026-11-04 (`e45c573`). The hanging-out part moved to item 12.

**Why:** Steven, 2026-11-04: friends waiting at home "look exactly like ones you can fight", so a full-size friend standing in its area looked like a fight that won't start. The 💛 over a friend's head sits off the top of the screen when he walks up close. He asked to "be able to swap them and/or have them in a home".

**As built:** the home is its own area, a meadow at golden hour (`home` in `src/areas.ts`), through a pink portal in the forest at [-16, 14], in view from the spawn, that opens at 1 friend. A spot in the forest would have shared the screen with three wild dragons and 150 trees, and couldn't fit nine full-size dragons; its own area makes the rule absolute, since no dragon there is wild and no friend is anywhere else. Every dragon has a straw bed in a ring open toward the portal, the King's at the back (`beds` in `src/main.ts`); empty beds hint at friends still to find. Tapping a friend there (any part of it, heart included) brings it along or sends it back to bed; with 3 following, the oldest pick goes back. A new friend joins him and the oldest pick flies off home. The choice is `following` in `src/save.ts`; an old save starts with its 3 most recent friends. Since item 5, the home is the middle of the big world.

## 7. Follow camera

**Status:** done 2026-11-04 (`2b1c5ce`)

**As built:** `followHeading` in `src/main.ts`. On foot it waits 0.7 s into a walk before following: the 30° dead zone alone let a 2 m step sideways turn the view 32°. Once a turn starts it lines up to within 1°, so a long walk ends right behind him. The turn speed eases in and out (about 0.3 s up to 90°/s), since starting at full rate was a visible jolt. Riding follows from 0.3 s and 15°, at up to about 140°/s. A finger on the canvas pauses it, and so does 2 s after any touch that wasn't a tap. Testing tip: synthetic touch-type pointer moves make Babylon report a pointer up and a tap, which walks him to the spot under the finger; drive drags with `pointerType: 'mouse'` events instead.

**Why:** Steven, 2026-11-04: the camera should turn to show what the wizard is looking at. Today it follows his position but turns only when he drags it, or for a scripted shot (`camCue` in `src/main.ts`).

**Build:** a lazy follow camera, not one locked behind him. Tap-to-walk is why: with a locked camera, tapping a spot to the side turns him, the camera swings, and the spot he tapped slides across the screen. Swinging cameras also make kids feel carsick. In the per-frame camera code (around `Vector3.LerpToRef(camera.target, ...)` in `src/main.ts`):
- **Swing only while he's moving:** ease `camera.alpha` toward `behind(wizard.root.rotation.y)` at a capped rate, about 90° a second, slowing as it lines up. Standing still, it stays where it is.
- **Dead zone:** heading differences under about 30° don't move it, so small steps don't wobble the view.
- **No flip toward the camera:** if he walks back toward the screen (heading more than about 120° from the view), hold still instead of spinning 180°.
- **His drag wins:** while a finger turns the camera, and for about 2 seconds after, the follow pauses (the touch code that tells taps from drags, near "A quick touch that barely moves").
- **Riding and flying** follow the dragon's heading more tightly, since steering blind is hard.
- **Scripted shots win:** no follow while a `camCue` is active, or in the face-off or the wardrobe.

**Done when:** in the browser at 1180×820, a long walk ends with the camera behind him without a jerk; a short sidestep doesn't move it; walking toward the camera doesn't flip it; a drag isn't fought by the follow; riding follows the dragon; and face-offs, the wardrobe and the King's battle frame as before.

## 8. Fast on the iPad

**Status:** done 2026-11-04 (`a897b26`). Not measured on the iPad itself; measured in the browser at the iPad's canvas size (1770×1230).

**As built:** the costs were on the CPU, not the GPU. The glow layer drew every visible mesh a second time; it now draws only what glows (`glowing` in `src/world.ts`: spells, crystal, eyes, stars, lines, lava, glowing ground) at a quarter of the screen's size. Trees behind the camera or past the fog's end leave the scene, and only those within 35 m sway. Rocks and sprinkles are thin instances, and each dragon's parts merge into about 8 meshes (`mergeParts` in `src/characters.ts`). The worst find: changing the scene's image-processing exposure or contrast tells all 127 materials, which flag every mesh, about 13 ms a frame on a Mac whenever the look blend moves (crossing a line, flying); the grade now has its own configuration on the film pass. A startup probe (`probeQuality` in `src/main.ts`, levels in `QUALITY`) steps from 1.5× pixels with 4× MSAA to 1.25× with FXAA, then 1×, while frames run under about 45 fps. Per frame at 1180×820, CPU throttled 4× (synced to the GPU): middle 17.9 → 8.5 ms, forest 17.6 → 8.7, snow 18.2 → 8.6, volcano 16.8 → 8.8, summit 19.6 → 8.4, riding 92.8 → 10.1, King's battle 17.5 → 11.8, face-off with friends 16.6 → 8.7. Unthrottled: CPU 3.1–3.9 → 1.0–1.8 ms, GPU 1.2–1.6 → 0.8–1.2 ms, draw calls 289–686 → 116–200. The hearts over friends now show yellow; the old glow washed them white. Testing tip: Playwright's plugin browser isn't installed, but Brave headless with `--use-angle=metal` drives the real GPU and accepts CDP CPU throttling; its rAF pacing is unreliable, so time `scene.render()` directly.

**Was:** ready. Steven, 2026-11-04: "it's really slow on ipad now."

**Why:** the one big world (item 5) put every region, dragon and tree in one scene, and the browser already measured it slower than the portal areas; it was never checked on the iPad itself. Every later item adds to the scene, so this goes first.

**Build:** measure first, then cut what costs the most, keeping the look where it's cheap. Measure on the iPad if a session can reach it (the Cloudflare quick tunnel in the vault note), otherwise in the browser with the CPU throttled and the canvas at the iPad's real size. Suspects, from the code as of `c5bca10`:
- **Two glows:** a `GlowLayer` (`src/main.ts`) and the film pipeline's bloom (`setupFilm` in `src/world.ts`, kernel 64) both blur the frame every frame. One of them is probably enough.
- **Resolution:** `setHardwareScalingLevel(1 / min(devicePixelRatio, 1.5))` renders an iPad at about 1770×1230 through every post-process. Try 1.0 to 1.25 on touch devices.
- **MSAA:** `film.samples = 4` on the post-process target. FXAA is much cheaper on iPad GPUs.
- **Shadows:** a 1024 map re-rendered each frame with trees within 32 m casting. Fewer casters, or a lower refresh rate.
- **Draw calls:** every dragon is in the scene at once, made of many small meshes. Dragons far from him can be disabled, and static meshes frozen (`freezeWorldMatrix`, `scene.freezeActiveMeshes` where it holds).
- **Per-frame work:** the 16-point region sampling for the look blend, `updatePresence`, the tree fader.

If the frame rate still falls short, add a quality level chosen at startup from a short frame-time probe, rather than one setting for every device.

**Done when:** before-and-after frame times for the same spots are in the wrap-up (in the middle, inside each world, riding, a face-off with friends helping, the King's battle); the game holds about 60 fps on the iPad, or 30 fps steady if 60 isn't reachable; and the look is still the film look in a side-by-side screenshot.

## 9. Pick which dragon to ride

**Status:** ready. Steven, 2026-11-04: "ability to choose which dragon to ride/switch."

**Why:** the ride button takes whichever following friend is nearest (`toggleRide` in `src/main.ts`), so he can't choose, and he has to land to change.

**Build:** tapping one of the pets beside him mounts that one; while riding, tapping another pet flies him across onto it, with the same burst and whoosh as mounting, and the old one shrinks back to a pet. The ride button keeps working as now (nearest friend, or land). The pets are small and beside his shoulders, so their tap targets may need to be larger than the meshes. Who he can ride is who follows him, chosen at the dragon home.

**Done when:** in the browser at 1180×820, with 3 friends following, tapping each pet mounts that one; tapping another while flying switches without landing; the ride button still mounts and lands; a tap on a pet never also walks him to the spot.

## 10. Endless dragons, or start again

**Status:** done 2026-11-04 (`649a9a7`).

**Why:** Steven, 2026-11-04: "somehow have unlimited dragons and/or ability to restart the game." Once every dragon is a friend there is nothing left to befriend.

**Build:**
- **Babies hatch after the King:** once the King is a friend, a 🥚🐣 banner follows his 🎉, and one baby dragon waits in each of the forest, snow and volcano, on the first dragons' spots (they sleep at home by then). The summit stays the King's.
  - A baby's look comes from its id (`baby-<world>-<n>`), so the save keeps only the id in `friends`: body and belly from a set of color pairs, a random element beaten by its `WEAKNESS`, size 0.8 to 1.2, horn length. The usual three strong hits befriend it.
  - Befriending one schedules the next in that world about 20 seconds later, hatching only while he's out of sight of its spot, with a puff of sparkles.
- **Beds:** a second ring of 12 beds at home, outside the first, three to each quarter between the ways out. The newest 12 babies sleep there; an older one that isn't walking with him leaves the map, but stays in the save and the count. Dragons cost few draw calls since they were merged, but the home shouldn't grow forever.
- **Summit:** every friend still flies in there, but only the first eight and the ones he picked, so a crowd of babies doesn't follow him up.
- **Dragons-left rows:** a finished world keeps its gold row and ⭐, plus one more slot for its baby: dim in the baby's own color while it waits, lit once befriended. The slots shrink a little to fit five.
- **Friends row:** the nine 🐉 stay, followed by `+N` for the babies, a number as the ⭐ count already uses.
- **Start again:** a small 🔄 in the corner of the title screen, shown only once there is something to lose. Holding it for 3 seconds fills a ring round it with a rising sound; letting go early drains it. Full, it whooshes and reloads into a fresh game. It wipes friends, stars and who walks with him, and keeps the robe, hat, staff, name and sound. The old save is first copied to `wizard-game-v1-before-restart`, which the game never reads, so Steven can copy it back from the console.

**Done when:** in the browser at 1180×820, a save with all nine friends shows a baby in each of the three worlds; befriending one lights its slot, gives it an outer bed, and a new one hatches out of sight; 13 babies leave the oldest off the map; a fresh save shows no 🔄; holding 🔄 under 3 seconds does nothing; and a full hold wipes progress but keeps his look.

## 11. More to explore

**Status:** waiting on what "more" means (asked 2026-11-04).

**Why:** Steven, 2026-11-04: "more world exploration."

**Build:** to be written once the question is answered. Whatever it is, it lands after item 8, since adding to the world adds to the frame cost.

## 12. Hanging out with friends

**Status:** not shown to the nephew yet. Claude's idea from 2026-11-03; check he wants it before building.

**Why:** once he has collected every dragon, there's little to do with them.

**Build:** at the home (item 6), tapping a friend already chooses who follows, so these need their own gesture or button: pet it (it purrs and hearts float up), feed it, or give it a name he types, which is saved. If item 5 has shipped, the home is the middle of the big world.

**Done when:** each interaction works on touch, doesn't clash with tapping to choose followers, and the names survive a reload.

## 13. The Quaternius forest

**Status:** done 2026-11-04 (`7302e75`). Frame cost measured in the browser at 1180×820 against the live site, not on the iPad itself. Download growth (2.1 → 2.6 MB) agreed by Steven.

**As built:** the kit is CC0, not the "no separate download" license described below, and only its free Standard half (68 models) is used. No glTF loader: `tools/pack-nature.mjs` cuts the chosen models (bark with meshoptimizer's sloppy simplifier, since the careful one stalls on the kit's seams; leaf cards thinned and enlarged), quantizes them into `public/nature/nature.bin` (280 KB) with 128–256 px textures, and `src/nature.ts` reads it. Trees are 640–1,700 triangles. Leaves use the kit's white textures, tinted by each world's `crown`; the green `_C` ones and all leaf and grass vertex colors (wind weights, black at the stem) are left out. Forest and home: round trees and a few pines, kit grass, bushes, ferns, flowers, mushrooms. Snow: frosted pines. Volcano: dead trees. Summit: dead trees untextured in glowing lavender, since the dark bark multiplies any glow. Rocks are the kit's, mossy on grass and plain stone elsewhere. Leaf cards fade to alpha² × 0.5 so a crown clears. The build targets ES2022 for top-level await. Forest per frame: 482k vs 460k triangles, 179 vs 159 draw calls; the summit got cheaper.

**Was:** ready, after item 8. Picked by Steven 2026-11-04, with the models in item 2.

**Why:** the picked dragon and wizard are hand-painted, and the procedural trees and ground from item 1 won't match them. Steven picked the look of the Quaternius Stylized Nature MegaKit: soft, chunky, bright trees, ferns, rocks and mushrooms. Its picture is on the shortlist page in item 2. It goes after item 8 because it adds to the frame cost. It doesn't need item 2, so it can be built first.

**Build:**
- **Download:** the Stylized Nature MegaKit is free, 116 models in glTF and FBX (https://quaternius.com/packs/stylizednaturemegakit.html). Keep the license file from the zip.
  - Quaternius allows use in a game with no credit, but not offering the files as a download of their own. The models can sit in the repo and be served by the game.
  - If the download needs an account, ask Steven.
- **Forest:** swap the procedural trees, rocks and sprinkles (`src/world.ts`) for a chosen subset of the kit.
- **Other worlds:** retint leaves and rocks per region (snow, volcano, summit), or keep their own pieces where a tint looks wrong.
- **Keep working:**
  - instancing, and `fader` with copies
  - the shadow casters' limit
  - the null LOD past the haze
  - the tree positions that `PathGrid` walks around
- **Light pass:** the film finish from item 1 stays, maybe with a lighter grade.

**Done when:** every region has been seen in the browser at 1180×820 with before-and-after screenshots, the forest reads like the kit's picture, the frame rate meets item 8's target, and the download growth is agreed with Steven.

## Done

- 2026-11-04: endless dragons and start again: after the King a baby always waits in the forest, snow and volcano, the newest 12 sleep on an outer ring of beds, and a 3-second hold on the title screen's 🔄 starts again, keeping his wizard (`649a9a7`).
- 2026-11-04: the Quaternius forest: the kit's trees, rocks, grass and plants in every world, packed small without a glTF loader; download 2.6 MB (`7302e75`).
- 2026-11-04: follow camera: the view eases round behind him while he walks or flies, at up to 90°/s, eased in and out; short steps, walking toward the screen, a finger on the camera and scripted shots leave it alone (`2b1c5ce`).
- 2026-11-04: one big world: the home in the middle with every world around it, a glowing line between each, walls of light on locked worlds, the dragons-left rows on posts at the lines, and sky, fog and grade blending as he crosses (`407affc`).
- 2026-11-04: dragons left in each world: a row of dragons in their own colors inside each portal's ring and in the corner, lit for each friend, gold with a star when a world is done (`ae4bc3f`).
- 2026-11-04: dragon home: friends not following him wait on straw beds in a meadow through a pink portal in the forest, and tapping one there brings it along or sends it back; the choice is saved (`e45c573`).
- 2026-11-04: pet-size friends: friends following him shrink to 40% and hover beside his shoulders, full size when ridden and in face-offs (`aa5d443`).
- 2026-11-04: look pass for the world: film finish (ACES, bloom, MSAA, vignette, grade per area), sky with sun and mountains, painted ground with tufts, layered tinted swaying trees (`a501268`).
- 2026-11-03: Dragon King finale, friends help in face-offs, staff and name picker, fading trees (`bf2f649`).
- 2026-11-03: friends at home wear a heart and greet him; flying up to a wild dragon lands him into the face-off (`892d152`).

## On hold

- Nothing on hold. The real models were picked 2026-11-04 and are item 2. The dragon design he picked is node 4:3 in the Figma concepts file (https://www.figma.com/design/bQZMzFrAXm36eTH8pu1wml).
