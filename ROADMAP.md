# Roadmap

Features to build, in order. Each session builds the top item that isn't done, following `CLAUDE.md`. When one ships, mark it done here with the date and commit, and move anything learned into the item it affects.

New ideas, his or Steven's, go in as a new item where they rank. Write each one so a session that knows nothing else can build it.

## 1. Pet-size friends

**Status:** next

**Why:** Steven, 2026-11-03: with several friends following, "they take up a lot of the screen and make it hard to move." The camera sits behind the wizard, and full-size dragons beside him fill the frame and hide the ground he taps on.

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

## 2. One big world

**Status:** waiting on his answer: which world goes in the middle (Steven's task in the vault note)

**Why:** his words, 2026-11-03: "Where there are all the worlds around it, just one line to separate all the worlds, and then one big world in the middle." Claude's reading (unconfirmed): one continuous map instead of portals, with the worlds side by side, a visible line on the ground between them, and a bigger world in the centre with the others around it.

**Build:** replace the portal areas (`src/areas.ts`, `buildArea` in `src/world.ts`, `enterArea` and `travel` in `src/main.ts`) with one map holding every region. Each region keeps its own ground color, trees, sprinkles and dragons. Locked regions (2, 4 and 8 friends today) need a barrier at their line, showing the friends it needs the way locked portal signs do now. Sky and fog change as he crosses into a region. Collected stars keep their ids, so saved progress survives.

Things to watch:
- `PathGrid` covers ±60 today and needs to cover the whole map.
- The shadow map is 1024 px over a much bigger area.
- Every dragon is in the scene at once, so `updatePresence` changes.
- The map is about four times the area, so check the frame rate in the browser before calling it done.

**Done when:** he can walk from the middle into every unlocked world without a loading fade, locked lines stop him and say why, the King still needs 8 friends, an old save loads with its friends and stars, and the frame rate holds.

## 3. Dragon home

**Status:** idea, Claude's (2026-11-03), not yet shown to him

**Why:** once he has collected every dragon, there's little to do with them.

**Build:** a spot where his friends hang out. He taps a friend to pet it (it purrs and hearts float up), feed it, or give it a name he types, which is saved. If item 2 has shipped, the spot goes in the middle world.

**Done when:** each interaction works on touch, and the names survive a reload.

## Done

- 2026-11-03: Dragon King finale, friends help in face-offs, staff and name picker, fading trees (`bf2f649`).
- 2026-11-03: friends at home wear a heart and greet him; flying up to a wild dragon lands him into the face-off (`892d152`).

## On hold

- **Real models:** rigged dragon and wizard models to replace the primitives. On hold by Steven, 2026-11-03. Match the dragon he picked: Figma concepts file https://www.figma.com/design/bQZMzFrAXm36eTH8pu1wml, node 4:3.
