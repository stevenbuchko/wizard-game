// Packs the chosen Quaternius Stylized Nature MegaKit models into public/nature/: one small binary of meshes and
// a few small textures, so the game needs no glTF loader. Run on a Mac (it resizes with sips):
//   node tools/pack-nature.mjs "<unzipped Stylized Nature MegaKit[Standard]>"
// The kit is CC0, free from https://quaternius.itch.io/stylized-nature-megakit.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";

const kit = process.argv[2];
if (!kit) throw new Error("usage: node tools/pack-nature.mjs <kit folder>");
const out = new URL("../public/nature/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

// What the game uses, and how far to cut each: bark keeps this share of its triangles, leaves this share of its cards.
const MODELS = {
  CommonTree_1: { bark: 0.15, leaves: 0.6 },
  CommonTree_3: { bark: 0.15, leaves: 0.65 },
  CommonTree_5: { bark: 0.15, leaves: 0.65 },
  Pine_1: { bark: 0.15, leaves: 0.7 },
  Pine_4: { bark: 0.15, leaves: 0.7 },
  Pine_5: { bark: 0.3, leaves: 0.7 },
  DeadTree_1: { bark: 0.12 },
  DeadTree_2: { bark: 0.12 },
  DeadTree_3: { bark: 0.12 },
  Rock_Medium_1: { bark: 0.5 },
  Rock_Medium_2: { bark: 0.5 },
  Rock_Medium_3: { bark: 0.5 },
  Bush_Common: { leaves: 0.5 },
  Fern_1: {},
  Flower_3_Group: {},
  Flower_4_Group: { leaves: 0.6 },
  Mushroom_Common: { bark: 0.4 },
  Grass_Common_Short: { bark: 0.5 },
};

// Texture, size; leaves keep their alpha as PNG, the rest go to JPEG.
const TEXTURES = {
  "Bark_NormalTree.png": 256,
  "Bark_DeadTree.png": 256,
  "Leaves_NormalTree.png": 256,
  "Leaf_Pine.png": 256,
  "Leaves_TwistedTree.png": 256,
  "Leaves.png": 256,
  "Flowers.png": 128,
  "Grass.png": 128,
  "Mushrooms.png": 128,
  "Rocks_Diffuse.png": 256,
};
const ALPHA = new Set(["Leaves_NormalTree.png", "Leaf_Pine.png", "Leaves_TwistedTree.png", "Leaves.png", "Flowers.png", "Grass.png"]);
const texName = (png) => png.replace(".png", ALPHA.has(png) ? ".png" : ".jpg");

const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const ARRAY = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function read(gltf, bin, index) {
  const a = gltf.accessors[index];
  const view = gltf.bufferViews[a.bufferView];
  const n = WIDTH[a.type];
  const stride = view.byteStride ?? SIZE[a.componentType] * n;
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const result = new Float32Array(a.count * n);
  const scale = a.normalized ? { 5121: 255, 5123: 65535 }[a.componentType] : 1;
  for (let i = 0; i < a.count; i++) {
    const row = new ARRAY[a.componentType](bin.buffer, bin.byteOffset + start + i * stride, n);
    for (let j = 0; j < n; j++) result[i * n + j] = row[j] / scale;
  }
  return result;
}

// Leaves are cards: groups of triangles sharing vertices. Dropping some and enlarging the rest keeps the crown full.
function thinCards(positions, indices, keep, seed) {
  const parent = Array.from({ length: positions.length / 3 }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let t = 0; t < indices.length; t += 3) {
    parent[find(indices[t + 1])] = find(indices[t]);
    parent[find(indices[t + 2])] = find(indices[t]);
  }
  const roots = [...new Set(indices.map((i) => find(i)))];
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const kept = new Set(roots.filter(() => rand() < keep));
  const grow = 1 / Math.sqrt(0.5 + keep / 2);
  const centre = new Map();
  for (let v = 0; v < positions.length / 3; v++) {
    const r = find(v);
    const c = centre.get(r) ?? [0, 0, 0, 0];
    c[0] += positions[v * 3];
    c[1] += positions[v * 3 + 1];
    c[2] += positions[v * 3 + 2];
    c[3]++;
    centre.set(r, c);
  }
  for (let v = 0; v < positions.length / 3; v++) {
    const c = centre.get(find(v));
    for (let k = 0; k < 3; k++) positions[v * 3 + k] = c[k] / c[3] + (positions[v * 3 + k] - c[k] / c[3]) * grow;
  }
  const result = [];
  for (let t = 0; t < indices.length; t += 3) if (kept.has(find(indices[t]))) result.push(indices[t], indices[t + 1], indices[t + 2]);
  return Uint32Array.from(result);
}

// The kit's bark is split at every texture seam and full of open edges, where the careful simplifier stops after
// about a tenth; the sloppy one ignores the joins and reaches the target.
function simplify(positions, indices, keep) {
  const target = Math.floor((indices.length * keep) / 3) * 3;
  const [result] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 1);
  return result;
}

// Only the vertices the triangles still use, renumbered.
function compact(attributes, indices) {
  const map = new Map();
  const remapped = new Uint32Array(indices.length);
  indices.forEach((i, k) => {
    if (!map.has(i)) map.set(i, map.size);
    remapped[k] = map.get(i);
  });
  const result = {};
  for (const [name, { data, width }] of Object.entries(attributes)) {
    const a = new Float32Array(map.size * width);
    for (const [from, to] of map) for (let j = 0; j < width; j++) a[to * width + j] = data[from * width + j];
    result[name] = { data: a, width };
  }
  return { attributes: result, indices: remapped };
}

await MeshoptSimplifier.ready;
const chunks = [];
let offset = 0;
const put = (typed) => {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  chunks.push(bytes, new Uint8Array(pad));
  const at = offset;
  offset += bytes.length + pad;
  return at;
};

const models = {};
let seed = 7;
for (const [name, cut] of Object.entries(MODELS)) {
  const gltf = JSON.parse(readFileSync(join(kit, "glTF", `${name}.gltf`), "utf8"));
  const bin = readFileSync(join(kit, "glTF", gltf.buffers[0].uri));
  const parts = [];
  let triangles = 0;
  for (const p of gltf.meshes[0].primitives) {
    const material = gltf.materials[p.material];
    // The kit's leaves come painted green (_C) or white; white takes each world's tint.
    const image = gltf.images[gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index].source].uri.replace("_C.png", ".png");
    const isLeaves = material.alphaMode === "MASK" && !/Bark/.test(material.name);
    const attributes = {
      position: { data: read(gltf, bin, p.attributes.POSITION), width: 3 },
      normal: { data: read(gltf, bin, p.attributes.NORMAL), width: 3 },
      uv: { data: read(gltf, bin, p.attributes.TEXCOORD_0), width: 2 },
    };
    // On bark, vertex colors are grey shading in the creases; one channel is enough, and none where it's all white.
    // On leaves and grass they're the kit's wind weights, near black at the stem, so they're left out.
    if (p.attributes.COLOR_0 !== undefined && /Bark/.test(material.name)) {
      const c = read(gltf, bin, p.attributes.COLOR_0);
      const grey = new Float32Array(c.length / 4).map((_, i) => c[i * 4]);
      if (grey.some((g) => g < 0.99)) attributes.shade = { data: grey, width: 1 };
    }
    let indices = Uint32Array.from(read(gltf, bin, p.indices));
    const keep = isLeaves ? cut.leaves : cut.bark;
    if (keep && isLeaves) indices = thinCards(attributes.position.data, indices, keep, seed++);
    else if (keep) indices = simplify(attributes.position.data, indices, keep);
    const c = compact(attributes, indices);
    const pos = c.attributes.position.data;
    const min = [0, 1, 2].map((k) => Math.min(...pos.filter((_, i) => i % 3 === k)));
    const max = [0, 1, 2].map((k) => Math.max(...pos.filter((_, i) => i % 3 === k)));
    const uvs = c.attributes.uv.data;
    const uvMin = [0, 1].map((k) => Math.min(...uvs.filter((_, i) => i % 2 === k)));
    const uvMax = [0, 1].map((k) => Math.max(...uvs.filter((_, i) => i % 2 === k)));
    const q = (v, lo, hi) => Math.round(((v - lo) / (hi - lo || 1)) * 65535);
    const vertices = pos.length / 3;
    const part = {
      texture: texName(image),
      leaves: isLeaves,
      vertices,
      triangles: c.indices.length / 3,
      min,
      max,
      uvMin,
      uvMax,
      position: put(Uint16Array.from(pos, (v, i) => q(v, min[i % 3], max[i % 3]))),
      normal: put(Int8Array.from(c.attributes.normal.data, (v) => Math.round(v * 127))),
      uv: put(Uint16Array.from(uvs, (v, i) => q(v, uvMin[i % 2], uvMax[i % 2]))),
      shade: c.attributes.shade ? put(Uint8Array.from(c.attributes.shade.data, (v) => Math.round(v * 255))) : undefined,
      indices: put(vertices > 65535 ? c.indices : Uint16Array.from(c.indices)),
    };
    triangles += part.triangles;
    parts.push(part);
  }
  models[name] = parts;
  console.log(name.padEnd(20), "triangles", triangles);
}

const header = new TextEncoder().encode(JSON.stringify(models));
const headerPad = (4 - ((header.length + 4) % 4)) % 4;
const size = new Uint32Array([header.length + headerPad]);
const padded = new Uint8Array(header.length + headerPad).fill(32);
padded.set(header);
writeFileSync(join(out, "nature.bin"), Buffer.concat([Buffer.from(size.buffer), padded, ...chunks.map((c) => Buffer.from(c))]));

for (const [png, px] of Object.entries(TEXTURES)) {
  const to = join(out, texName(png));
  if (ALPHA.has(png)) execFileSync("sips", ["-Z", String(px), join(kit, "glTF", png), "--out", to], { stdio: "ignore" });
  else execFileSync("sips", ["-Z", String(px), "-s", "format", "jpeg", "-s", "formatOptions", "80", join(kit, "glTF", png), "--out", to], { stdio: "ignore" });
}
copyFileSync(join(kit, "License_Standard.txt"), join(out, "LICENSE.txt"));
console.log("wrote", out);
