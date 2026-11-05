import type { ModelName } from "./nature";

export type AreaId = "forest" | "snow" | "volcano" | "summit" | "home";

// The film finish. Saturation and densities run -100 to 100; hues are degrees, tinting the highlights and the shadows.
export interface Grade {
  exposure: number;
  contrast: number;
  saturation: number;
  highlights: [hue: number, density: number];
  shadows: [hue: number, density: number];
  bloom: number; // brightness that starts to glow
}

export interface AreaSpec {
  id: AreaId;
  sky: string; // the horizon, which the fog fades into
  skyTop: string;
  sun: string; // the glow around the sun
  mountains: [string, string]; // the far range, then the near one
  peaks?: string; // snow on the mountain tops
  ground: string;
  floor: "grass" | "snow" | "ash" | "crystal"; // how the ground is painted, and what grows from it
  tuft: string; // the grass tufts' tint, or the color of the frost, stalks or shards that stand in for them
  kinds: ModelName[]; // the kit's trees that grow here, picked at random
  trunk: string; // a tint over the kit's painted bark; white keeps it as painted
  crown: string; // the leaves' color; the kit paints them white
  crownGlows?: boolean;
  trees: number;
  rock: string; // a tint over the kit's rocks
  plants?: ModelName[]; // bushes, ferns, flowers and mushrooms from the kit, instead of sprinkles
  sprinkle: string; // ice crystals or embers, where there are no plants
  sprinkleGlows?: boolean;
  lava?: boolean;
  beds?: string; // a straw bed at every dragon's spot, for the home
  grade: Grade;
  lineColor: string; // its line's glow, and the edge of its dragons-left row
  at: number; // which way the world lies from the home in the middle, in degrees from +z toward +x
  needs: number; // friends required to cross its line
  stars: [number, number, number][]; // up high, only reachable riding a dragon; [x, y, z] in the world's own spots (src/map.ts)
}

export const AREAS: Record<AreaId, AreaSpec> = {
  forest: {
    id: "forest",
    sky: "#8cc4ee",
    skyTop: "#2a74dc",
    sun: "#fff1c9",
    mountains: ["#6f9cc8", "#4d8a7c"],
    ground: "#5c9940",
    floor: "grass",
    tuft: "#7dbd4c",
    kinds: ["CommonTree_1", "CommonTree_3", "CommonTree_5", "CommonTree_1", "Pine_4"],
    trunk: "#ffffff",
    crown: "#8cc63c",
    trees: 150,
    rock: "#ffffff",
    plants: ["Bush_Common", "Fern_1", "Flower_3_Group", "Flower_4_Group", "Mushroom_Common", "Fern_1"],
    sprinkle: "#ffd94d",
    grade: { exposure: 1.3, contrast: 1.15, saturation: 35, highlights: [45, 25], shadows: [215, 30], bloom: 0.8 },
    lineColor: "#6fdc8c",
    at: 0,
    needs: 0,
    stars: [[10, 9, 10], [-15, 10, -8], [20, 9, -28], [-30, 11, 20], [30, 9, 12]],
  },
  snow: {
    id: "snow",
    sky: "#dce8f2",
    skyTop: "#6f9fd0",
    sun: "#fffaf0",
    mountains: ["#b6c8da", "#8ea6bf"],
    peaks: "#f4f8fc",
    ground: "#e9eff5",
    floor: "snow",
    tuft: "#9fbcb0",
    kinds: ["Pine_1", "Pine_4", "Pine_5"],
    trunk: "#d8d0cc",
    crown: "#6f9f8a",
    trees: 110,
    rock: "#e4eef6",
    sprinkle: "#bfe6ff",
    sprinkleGlows: true,
    grade: { exposure: 1.15, contrast: 1.1, saturation: 20, highlights: [200, 10], shadows: [220, 50], bloom: 0.95 },
    lineColor: "#bfe6ff",
    at: -90,
    needs: 2,
    stars: [[0, 10, 0], [-28, 9, -20], [28, 11, -18], [-14, 10, 30], [16, 9, 32]],
  },
  volcano: {
    id: "volcano",
    sky: "#c98a62",
    skyTop: "#4a2a2e",
    sun: "#ffb070",
    mountains: ["#7a4e45", "#3e2a28"],
    ground: "#3d302d",
    floor: "ash",
    tuft: "#2e2522",
    kinds: ["DeadTree_1", "DeadTree_2", "DeadTree_3"],
    trunk: "#4a3f3c",
    crown: "#4a3f3c",
    trees: 70,
    rock: "#6e5f5a",
    sprinkle: "#ff7a2e",
    sprinkleGlows: true,
    lava: true,
    grade: { exposure: 1.15, contrast: 1.2, saturation: 15, highlights: [30, 40], shadows: [350, 40], bloom: 0.7 },
    lineColor: "#ff7a2e",
    at: 90,
    needs: 4,
    stars: [[0, 11, 0], [-26, 9, -22], [26, 10, -20], [-20, 10, 28], [22, 11, 30]],
  },
  summit: {
    id: "summit",
    sky: "#7a6fb8",
    skyTop: "#1e1a48",
    sun: "#ffe7a8",
    mountains: ["#5a5094", "#3a3270"],
    peaks: "#c8c0f0",
    ground: "#8a86ab",
    floor: "crystal",
    tuft: "#c9b6ff",
    kinds: ["DeadTree_1", "DeadTree_2", "DeadTree_3"],
    trunk: "#c9b6ff",
    crown: "#c9b6ff",
    crownGlows: true,
    trees: 45,
    rock: "#ddd4ff",
    sprinkle: "#ffe28a",
    sprinkleGlows: true,
    grade: { exposure: 1.1, contrast: 1.15, saturation: 20, highlights: [50, 30], shadows: [260, 50], bloom: 0.7 },
    lineColor: "#ffd34d",
    at: 180,
    needs: 8,
    stars: [[0, 14, -8], [-26, 10, -18], [26, 10, -18], [-22, 11, 28], [22, 11, 28]],
  },
  // The middle of the map, where his friends wait when they aren't walking with him, so no friend stands about looking wild.
  home: {
    id: "home",
    sky: "#f6c89a",
    skyTop: "#6f86d4",
    sun: "#fff0c0",
    mountains: ["#b28fae", "#6f9064"],
    ground: "#79a84a",
    floor: "grass",
    tuft: "#9bcf5a",
    kinds: ["CommonTree_3", "CommonTree_5"],
    trunk: "#ffffff",
    crown: "#a6d84a",
    trees: 24,
    rock: "#ffffff",
    plants: ["Flower_4_Group", "Flower_3_Group", "Bush_Common", "Fern_1"],
    sprinkle: "#ff8fc8",
    beds: "#d9b45a",
    grade: { exposure: 1.25, contrast: 1.1, saturation: 35, highlights: [35, 30], shadows: [280, 25], bloom: 0.8 },
    lineColor: "#ff8fc8",
    at: 0, // the middle itself
    needs: 0,
    stars: [],
  },
};
