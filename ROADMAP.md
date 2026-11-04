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

## 2. Look pass: the dragons and the wizard

**Status:** waiting on the models decision. Steven is choosing models with him from a shortlist (2026-11-04). If a model is picked, this item becomes "swap in the models", and the work below is skipped, since a model replaces the primitive characters entirely.

**Why:** the characters are what he looks at most, and they're still primitives.

**Build:** in `src/characters.ts`, without bought models:
- **Dragons:** smooth tapered neck and tail (tubes along a curve) instead of chains of spheres, a jaw with teeth, eyes with pupils that blink, wings with bones and a curved membrane, claws, a scale texture, and legs that step when walking.
- **Wizard:** a flowing robe, arms that raise the staff to cast, and a beard or hair.

Keep every handle `src/main.ts` uses (`root`, `head`, `wings`, `skin`, `heart`, `crystal`), since the game logic drives them.

**Done when:** every dragon and the wizard look right from the play camera, the face-off camera and the wardrobe close-up, and the frame rate holds.

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

## 4. One big world

**Status:** waiting on his answer: which world goes in the middle (Steven's task in the vault note)

**Why:** his words, 2026-11-03: "Where there are all the worlds around it, just one line to separate all the worlds, and then one big world in the middle." Claude's reading (unconfirmed): one continuous map instead of portals, with the worlds side by side, a visible line on the ground between them, and a bigger world in the centre with the others around it.

**Build:** replace the portal areas (`src/areas.ts`, `buildArea` in `src/world.ts`, `enterArea` and `travel` in `src/main.ts`) with one map holding every region. Each region keeps its own ground color, trees, sprinkles and dragons. Locked regions (2, 4 and 8 friends today) need a barrier at their line, showing the friends it needs the way locked portal signs do now. Sky and fog change as he crosses into a region. Collected stars keep their ids, so saved progress survives.

Things to watch:
- `PathGrid` covers ±60 today and needs to cover the whole map.
- The shadow map is 1024 px over a much bigger area.
- Every dragon is in the scene at once, so `updatePresence` changes.
- The map is about four times the area, so check the frame rate in the browser before calling it done.
- Sky, mountains, fog and the film grade are set per area on arrival (`buildSky` and `setupFilm` in `src/world.ts`, values in `src/areas.ts`). One map needs them blended as he crosses a line, and the ground texture and tufts painted per region.

**Done when:** he can walk from the middle into every unlocked world without a loading fade, locked lines stop him and say why, the King still needs 8 friends, an old save loads with its friends and stars, and the frame rate holds.

## 5. Dragon home

**Status:** done 2026-11-04 (`e45c573`). The hanging-out part moved to item 6.

**Why:** Steven, 2026-11-04: friends waiting at home "look exactly like ones you can fight", so a full-size friend standing in its area looked like a fight that won't start. The 💛 over a friend's head sits off the top of the screen when he walks up close. He asked to "be able to swap them and/or have them in a home".

**As built:** the home is its own area, a meadow at golden hour (`home` in `src/areas.ts`), through a pink portal in the forest at [-16, 14], in view from the spawn, that opens at 1 friend. A spot in the forest would have shared the screen with three wild dragons and 150 trees, and couldn't fit nine full-size dragons; its own area makes the rule absolute, since no dragon there is wild and no friend is anywhere else. Every dragon has a straw bed in a ring open toward the portal, the King's at the back (`beds` in `src/main.ts`); empty beds hint at friends still to find. Tapping a friend there (any part of it, heart included) brings it along or sends it back to bed; with 3 following, the oldest pick goes back. A new friend joins him and the oldest pick flies off home. The choice is `following` in `src/save.ts`; an old save starts with its 3 most recent friends. When item 4 ships, the home becomes a region of the big world.

## 6. Hanging out with friends

**Status:** not shown to the nephew yet. Claude's idea from 2026-11-03; check he wants it before building.

**Why:** once he has collected every dragon, there's little to do with them.

**Build:** at the home (item 5), tapping a friend already chooses who follows, so these need their own gesture or button: pet it (it purrs and hearts float up), feed it, or give it a name he types, which is saved. If item 4 has shipped, the home is in the big world.

**Done when:** each interaction works on touch, doesn't clash with tapping to choose followers, and the names survive a reload.

## Done

- 2026-11-04: dragon home: friends not following him wait on straw beds in a meadow through a pink portal in the forest, and tapping one there brings it along or sends it back; the choice is saved (`e45c573`).
- 2026-11-04: pet-size friends: friends following him shrink to 40% and hover beside his shoulders, full size when ridden and in face-offs (`aa5d443`).
- 2026-11-04: look pass for the world: film finish (ACES, bloom, MSAA, vignette, grade per area), sky with sun and mountains, painted ground with tufts, layered tinted swaying trees (`a501268`).
- 2026-11-03: Dragon King finale, friends help in face-offs, staff and name picker, fading trees (`bf2f649`).
- 2026-11-03: friends at home wear a heart and greet him; flying up to a wild dragon lands him into the face-off (`892d152`).

## On hold

- **Real models:** rigged dragon and wizard models to replace the primitives. On hold by Steven, 2026-11-03; on 2026-11-04 he asked for a shortlist to pick from with the nephew, which decides item 2. Match the dragon he picked: Figma concepts file https://www.figma.com/design/bQZMzFrAXm36eTH8pu1wml, node 4:3.
