import { Color3, Mesh, Scene, StandardMaterial, Texture, VertexData } from "./babylon";

// The trees, rocks and plants from the Quaternius Stylized Nature MegaKit (CC0), packed by tools/pack-nature.mjs
// into public/nature/: one binary of meshes, so the game needs no glTF loader, and a few small textures.

interface PackedPart {
  texture: string;
  leaves: boolean;
  vertices: number;
  triangles: number;
  min: number[];
  max: number[];
  uvMin: number[];
  uvMax: number[];
  position: number;
  normal: number;
  uv: number;
  shade?: number;
  indices: number;
}

export interface Part {
  geometry: VertexData;
  texture: string;
  leaves: boolean;
}

export interface Model {
  parts: Part[];
  height: number;
  reach: number; // how far its widest part spreads from the trunk
}

export type ModelName =
  | "CommonTree_1" | "CommonTree_3" | "CommonTree_5"
  | "Pine_1" | "Pine_4" | "Pine_5"
  | "DeadTree_1" | "DeadTree_2" | "DeadTree_3"
  | "Rock_Medium_1" | "Rock_Medium_2" | "Rock_Medium_3"
  | "Bush_Common" | "Fern_1" | "Flower_3_Group" | "Flower_4_Group" | "Mushroom_Common" | "Grass_Common_Short";

let models: Record<ModelName, Model>;

export async function loadNature(): Promise<void> {
  const buffer = await (await fetch("nature/nature.bin")).arrayBuffer();
  const headerLength = new Uint32Array(buffer, 0, 1)[0];
  const packed = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as Record<ModelName, PackedPart[]>;
  const data = 4 + headerLength;
  const loaded = {} as Record<ModelName, Model>;
  for (const [name, parts] of Object.entries(packed) as [ModelName, PackedPart[]][]) {
    let height = 0;
    let reach = 0;
    loaded[name] = {
      parts: parts.map((p) => {
        const q = new Uint16Array(buffer, data + p.position, p.vertices * 3);
        const n = new Int8Array(buffer, data + p.normal, p.vertices * 3);
        const t = new Uint16Array(buffer, data + p.uv, p.vertices * 2);
        const positions = new Float32Array(p.vertices * 3);
        const normals = new Float32Array(p.vertices * 3);
        const uvs = new Float32Array(p.vertices * 2);
        // glTF is right-handed and Babylon left-handed: mirror z. Babylon's front faces wind the other way too,
        // so the triangles keep their order.
        for (let i = 0; i < p.vertices * 3; i++) {
          const k = i % 3;
          const flip = k === 2 ? -1 : 1;
          positions[i] = flip * (p.min[k] + (q[i] / 65535) * (p.max[k] - p.min[k]));
          normals[i] = (flip * n[i]) / 127;
        }
        for (let i = 0; i < p.vertices * 2; i++) uvs[i] = p.uvMin[i % 2] + (t[i] / 65535) * (p.uvMax[i % 2] - p.uvMin[i % 2]);
        const wide = p.vertices > 65535;
        const raw = wide ? new Uint32Array(buffer, data + p.indices, p.triangles * 3) : new Uint16Array(buffer, data + p.indices, p.triangles * 3);
        const indices = Uint32Array.from(raw);
        const geometry = new VertexData();
        geometry.positions = positions;
        geometry.normals = normals;
        geometry.uvs = uvs;
        geometry.indices = indices;
        if (p.shade !== undefined) {
          const s = new Uint8Array(buffer, data + p.shade, p.vertices);
          const colors = new Float32Array(p.vertices * 4);
          s.forEach((v, i) => colors.set([v / 255, v / 255, v / 255, 1], i * 4));
          geometry.colors = colors;
        }
        height = Math.max(height, p.max[1]);
        reach = Math.max(reach, -p.min[0], p.max[0], -p.min[2], p.max[2]);
        return { geometry, texture: p.texture, leaves: p.leaves };
      }),
      height,
      reach,
    };
  }
  models = loaded;
}

export function model(name: ModelName): Model {
  return models[name];
}

const textures = new Map<string, Texture>();
// Leaves painted white, for each world to tint; the rest keep their painted colors under the bark's tint.
const WHITE_LEAVES = new Set(["Leaves_NormalTree.png", "Leaf_Pine.png", "Leaves_TwistedTree.png"]);

// One mesh per part of a model, for instances to copy: bark in the tint given, white leaves in theirs.
export function sourceMeshes(scene: Scene, name: ModelName, tint: { bark: Color3; leaves?: Color3; glow?: Color3; plain?: boolean }): Mesh[] {
  return model(name).parts.map((part) => {
    const mesh = new Mesh(name, scene);
    part.geometry.applyToMesh(mesh);
    let texture = textures.get(part.texture);
    if (!texture || texture.getScene() !== scene) {
      // glTF textures run top to bottom, so no flip.
      texture = new Texture(`nature/${part.texture}`, scene, false, false);
      texture.hasAlpha = part.leaves;
      textures.set(part.texture, texture);
    }
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = WHITE_LEAVES.has(part.texture) ? tint.leaves ?? tint.bark : tint.bark;
    m.specularColor = Color3.Black();
    // A glowing tree is smooth crystal: the painted bark would darken the glow, which it multiplies. Plain is
    // for stone the kit's mossy paint doesn't suit, such as snow or ash.
    if (tint.glow) m.emissiveColor = tint.glow;
    if (!tint.glow && !tint.plain) m.diffuseTexture = texture;
    // Leaf cards are seen from both sides, lit the same either way.
    if (part.leaves) {
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
    }
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  });
}
