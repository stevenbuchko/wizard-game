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

**Status:** done 2026-11-04 (`e45c573`). The hanging-out part moved to item 7.

**Why:** Steven, 2026-11-04: friends waiting at home "look exactly like ones you can fight", so a full-size friend standing in its area looked like a fight that won't start. The 💛 over a friend's head sits off the top of the screen when he walks up close. He asked to "be able to swap them and/or have them in a home".

**As built:** the home is its own area, a meadow at golden hour (`home` in `src/areas.ts`), through a pink portal in the forest at [-16, 14], in view from the spawn, that opens at 1 friend. A spot in the forest would have shared the screen with three wild dragons and 150 trees, and couldn't fit nine full-size dragons; its own area makes the rule absolute, since no dragon there is wild and no friend is anywhere else. Every dragon has a straw bed in a ring open toward the portal, the King's at the back (`beds` in `src/main.ts`); empty beds hint at friends still to find. Tapping a friend there (any part of it, heart included) brings it along or sends it back to bed; with 3 following, the oldest pick goes back. A new friend joins him and the oldest pick flies off home. The choice is `following` in `src/save.ts`; an old save starts with its 3 most recent friends. Since item 5, the home is the middle of the big world.

## 7. Hanging out with friends

**Status:** not shown to the nephew yet. Claude's idea from 2026-11-03; check he wants it before building.

**Why:** once he has collected every dragon, there's little to do with them.

**Build:** at the home (item 6), tapping a friend already chooses who follows, so these need their own gesture or button: pet it (it purrs and hearts float up), feed it, or give it a name he types, which is saved. If item 5 has shipped, the home is the middle of the big world.

**Done when:** each interaction works on touch, doesn't clash with tapping to choose followers, and the names survive a reload.

## Done

- 2026-11-04: one big world: the home in the middle with every world around it, a glowing line between each, walls of light on locked worlds, the dragons-left rows on posts at the lines, and sky, fog and grade blending as he crosses (`407affc`).
- 2026-11-04: dragons left in each world: a row of dragons in their own colors inside each portal's ring and in the corner, lit for each friend, gold with a star when a world is done (`ae4bc3f`).
- 2026-11-04: dragon home: friends not following him wait on straw beds in a meadow through a pink portal in the forest, and tapping one there brings it along or sends it back; the choice is saved (`e45c573`).
- 2026-11-04: pet-size friends: friends following him shrink to 40% and hover beside his shoulders, full size when ridden and in face-offs (`aa5d443`).
- 2026-11-04: look pass for the world: film finish (ACES, bloom, MSAA, vignette, grade per area), sky with sun and mountains, painted ground with tufts, layered tinted swaying trees (`a501268`).
- 2026-11-03: Dragon King finale, friends help in face-offs, staff and name picker, fading trees (`bf2f649`).
- 2026-11-03: friends at home wear a heart and greet him; flying up to a wild dragon lands him into the face-off (`892d152`).

## On hold

- **Real models:** rigged dragon and wizard models to replace the primitives. On hold by Steven, 2026-11-03; on 2026-11-04 he asked for a shortlist to pick from with the nephew, which decides item 2. Match the dragon he picked: Figma concepts file https://www.figma.com/design/bQZMzFrAXm36eTH8pu1wml, node 4:3.
