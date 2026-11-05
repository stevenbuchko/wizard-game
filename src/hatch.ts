import type { AreaId } from "./areas";
import { DRAGONS, WEAKNESS, type DragonSpec, type Element } from "./dragons";

// Once the King is a friend, baby dragons hatch: one always waits in each of these worlds, and befriending it hatches
// the next. A baby's look comes from its id, so the save keeps only the id and a friend looks the same every time.

export const NESTS: AreaId[] = ["forest", "snow", "volcano"];
export const BABY_BEDS = 12;
export const HATCH_DELAY = 20; // seconds after one is befriended before the next hatches

// Body and belly, picked to look apart from each other and from the first nine.
const COATS: [string, string][] = [
  ["#e05a9a", "#ffd0e4"],
  ["#3a9ad9", "#c8ecff"],
  ["#f2c230", "#fff4c0"],
  ["#7a3fc4", "#e0c8ff"],
  ["#2fae8a", "#c8f5e0"],
  ["#ff8a3d", "#ffe0c0"],
  ["#5c6bc0", "#d0d8ff"],
  ["#c0392b", "#ffd6a0"],
  ["#8bc34a", "#eaffc8"],
  ["#00a0b0", "#c0f4f8"],
  ["#d4a0e0", "#fff0ff"],
  ["#3e4a5c", "#9fd0ff"],
];
const ELEMENTS: Element[] = ["fire", "ice", "lightning"];

export const isBaby = (id: string) => id.startsWith("baby-");
export const babyId = (area: AreaId, n: number) => `baby-${area}-${n}`;

// Same id, same numbers: a small hash, then a few steps of a linear congruential generator.
function rolls(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
}

export function babyOf(id: string): DragonSpec {
  const [, area, n] = id.split("-") as [string, AreaId, string];
  const roll = rolls(id);
  const [color, belly] = COATS[Math.floor(roll() * COATS.length)];
  const element = ELEMENTS[Math.floor(roll() * ELEMENTS.length)];
  const spots = DRAGONS.filter((d) => d.area === area).map((d) => d.home);
  return {
    id,
    area,
    color,
    belly,
    element,
    weakTo: WEAKNESS[element],
    size: 0.8 + roll() * 0.4,
    horns: 0.5 + roll() * 0.5,
    home: spots[Number(n) % spots.length],
  };
}

// The baby waiting in a world: the one after those he has befriended there.
export function nextBaby(area: AreaId, friends: string[]): string {
  return babyId(area, friends.filter((id) => id.startsWith(`baby-${area}-`)).length);
}

export const hatching = (friends: string[]) => friends.includes("king");
