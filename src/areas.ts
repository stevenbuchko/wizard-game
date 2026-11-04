export type AreaId = "forest" | "snow" | "volcano" | "summit";

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
  tuft: string;
  trunk: string;
  crown: string;
  crownGlows?: boolean;
  cap?: string; // snow on the treetops
  dead?: boolean; // thin charred spires instead of full trees
  trees: number;
  rock: string;
  sprinkle: string; // flowers, ice crystals or embers
  sprinkleGlows?: boolean;
  lava?: boolean;
  grade: Grade;
  portalColor: string; // the swirl he sees when a portal leads here
  spawn: [number, number];
  portals: { to: AreaId; at: [number, number]; needs: number }[]; // needs: friends required to open
  stars: [number, number, number][]; // up high, only reachable riding a dragon
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
    trunk: "#664224",
    crown: "#215c33",
    trees: 150,
    rock: "#8c8c85",
    sprinkle: "#ffd94d",
    grade: { exposure: 1.3, contrast: 1.15, saturation: 35, highlights: [45, 25], shadows: [215, 30], bloom: 0.8 },
    portalColor: "#6fdc8c",
    spawn: [0, 0],
    portals: [
      { to: "snow", at: [-36, 32], needs: 2 },
      { to: "volcano", at: [36, 32], needs: 4 },
      { to: "summit", at: [0, -40], needs: 8 },
    ],
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
    trunk: "#5a4030",
    crown: "#3d6b5a",
    cap: "#ffffff",
    trees: 110,
    rock: "#a8b4bf",
    sprinkle: "#bfe6ff",
    sprinkleGlows: true,
    grade: { exposure: 1.15, contrast: 1.1, saturation: 20, highlights: [200, 10], shadows: [220, 50], bloom: 0.95 },
    portalColor: "#bfe6ff",
    spawn: [0, -34],
    portals: [{ to: "forest", at: [0, -40], needs: 0 }],
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
    trunk: "#2b2321",
    crown: "#2b2321",
    dead: true,
    trees: 70,
    rock: "#5a4d48",
    sprinkle: "#ff7a2e",
    sprinkleGlows: true,
    lava: true,
    grade: { exposure: 1.15, contrast: 1.2, saturation: 15, highlights: [30, 40], shadows: [350, 40], bloom: 0.7 },
    portalColor: "#ff7a2e",
    spawn: [0, -34],
    portals: [{ to: "forest", at: [0, -40], needs: 0 }],
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
    trunk: "#5c5880",
    crown: "#b49bff",
    crownGlows: true,
    dead: true,
    trees: 45,
    rock: "#c8c4e0",
    sprinkle: "#ffe28a",
    sprinkleGlows: true,
    grade: { exposure: 1.1, contrast: 1.15, saturation: 20, highlights: [50, 30], shadows: [260, 50], bloom: 0.7 },
    portalColor: "#ffd34d",
    spawn: [0, -34],
    portals: [{ to: "forest", at: [0, -40], needs: 0 }],
    stars: [[0, 14, -8], [-26, 10, -18], [26, 10, -18], [-22, 11, 28], [22, 11, 28]],
  },
};
