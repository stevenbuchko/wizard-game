export type AreaId = "forest" | "snow" | "volcano" | "summit";

export interface AreaSpec {
  id: AreaId;
  sky: string;
  ground: string;
  trunk: string;
  crown: string;
  cap?: string; // snow on the treetops
  dead?: boolean; // thin charred spires instead of full trees
  trees: number;
  rock: string;
  sprinkle: string; // flowers, ice crystals or embers
  sprinkleGlows?: boolean;
  lava?: boolean;
  portalColor: string; // the swirl he sees when a portal leads here
  spawn: [number, number];
  portals: { to: AreaId; at: [number, number]; needs: number }[]; // needs: friends required to open
  stars: [number, number, number][]; // up high, only reachable riding a dragon
}

export const AREAS: Record<AreaId, AreaSpec> = {
  forest: {
    id: "forest",
    sky: "#9ecbf2",
    ground: "#5c9940",
    trunk: "#664224",
    crown: "#215c33",
    trees: 150,
    rock: "#8c8c85",
    sprinkle: "#ffd94d",
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
    sky: "#cfe0ee",
    ground: "#e9eff5",
    trunk: "#5a4030",
    crown: "#3d6b5a",
    cap: "#ffffff",
    trees: 110,
    rock: "#a8b4bf",
    sprinkle: "#bfe6ff",
    sprinkleGlows: true,
    portalColor: "#bfe6ff",
    spawn: [0, -34],
    portals: [{ to: "forest", at: [0, -40], needs: 0 }],
    stars: [[0, 10, 0], [-28, 9, -20], [28, 11, -18], [-14, 10, 30], [16, 9, 32]],
  },
  volcano: {
    id: "volcano",
    sky: "#a8735e",
    ground: "#3d302d",
    trunk: "#2b2321",
    crown: "#2b2321",
    dead: true,
    trees: 70,
    rock: "#5a4d48",
    sprinkle: "#ff7a2e",
    sprinkleGlows: true,
    lava: true,
    portalColor: "#ff7a2e",
    spawn: [0, -34],
    portals: [{ to: "forest", at: [0, -40], needs: 0 }],
    stars: [[0, 11, 0], [-26, 9, -22], [26, 10, -20], [-20, 10, 28], [22, 11, 30]],
  },
  summit: {
    id: "summit",
    sky: "#3a3470",
    ground: "#8a86ab",
    trunk: "#5c5880",
    crown: "#b49bff",
    dead: true,
    trees: 45,
    rock: "#c8c4e0",
    sprinkle: "#ffe28a",
    sprinkleGlows: true,
    portalColor: "#ffd34d",
    spawn: [0, -34],
    portals: [{ to: "forest", at: [0, -40], needs: 0 }],
    stars: [[0, 14, -8], [-26, 10, -18], [26, 10, -18], [-22, 11, 28], [22, 11, 28]],
  },
};
