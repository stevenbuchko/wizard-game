import type { AreaId } from "./areas";

export type Element = "fire" | "ice" | "lightning";

// What beats what: ice beats fire, lightning beats ice, fire beats lightning.
export const WEAKNESS: Record<Element, Element> = { fire: "ice", ice: "lightning", lightning: "fire" };

/**
 * Every dragon in the game. To add one from his description, add an entry:
 * - area: where it lives
 * - color, belly, wings: hex colors (wings default to a darker body color)
 * - element: what it puffs at the wizard
 * - weakTo: the spell that befriends it, in three hits
 * - size: 1 is normal, 1.5 is big (optional)
 * - horns: horn length, 0.7 is normal (optional)
 * - home: [x, z] inside the area, both between -42 and 42, about 10 away from portals and other dragons
 * - phases: elements it switches through as it calms down, each beaten by its WEAKNESS (optional; element and weakTo are the first)
 * - hits: strong hits it takes to befriend, 3 by default (optional)
 * - crown: a gold crown (optional)
 */
export interface DragonSpec {
  id: string;
  area: AreaId;
  color: string;
  belly: string;
  wings?: string;
  element: Element;
  weakTo: Element;
  size?: number;
  horns?: number;
  home: [number, number];
  phases?: Element[];
  hits?: number;
  crown?: boolean;
}

export const DRAGONS: DragonSpec[] = [
  { id: "bronze", area: "forest", color: "#b84d29", belly: "#e6b373", element: "fire", weakTo: "ice", home: [0, 24] },
  { id: "frost", area: "forest", color: "#9ec7e6", belly: "#ebf2ff", element: "ice", weakTo: "lightning", home: [-26, -10] },
  { id: "storm", area: "forest", color: "#4d7347", belly: "#bfcc80", element: "lightning", weakTo: "fire", home: [24, -16] },
  { id: "glacier", area: "snow", color: "#dfe9f2", belly: "#ffffff", wings: "#a9c6de", element: "ice", weakTo: "lightning", size: 1.25, home: [0, 18] },
  { id: "aurora", area: "snow", color: "#6b4fb3", belly: "#c9b8f0", wings: "#3fb5a6", element: "lightning", weakTo: "fire", home: [-24, 4] },
  { id: "ember", area: "snow", color: "#9e1f1f", belly: "#f0a060", element: "fire", weakTo: "ice", size: 0.9, home: [24, 4] },
  { id: "magma", area: "volcano", color: "#2b2222", belly: "#e0592a", wings: "#6e1e10", element: "fire", weakTo: "ice", size: 1.45, horns: 1.1, home: [0, 20] },
  { id: "ash", area: "volcano", color: "#77706b", belly: "#c9c2b8", wings: "#4a4542", element: "lightning", weakTo: "fire", home: [-24, 2] },
  // The Dragon King: opens at 8 friends, and every friend flies in to help.
  { id: "king", area: "summit", color: "#d4a62a", belly: "#fff0c0", wings: "#7a2a8a", element: "fire", weakTo: "ice", size: 2, horns: 1.4, home: [0, 14], phases: ["fire", "ice", "lightning"], hits: 6, crown: true },
];
