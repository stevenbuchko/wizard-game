// Packs Toon Dragons by SPiN AG (Unity Asset Store) into public/models/dragon.bin: one skinned mesh, its bones, its
// ten clips and its textures, scrambled. Run on a Mac with Blender in /Applications:
//   node tools/pack-dragon.mjs ~/wizard-game-models/toon-dragons/src
// The model is paid for, and its license bars shipping it "in a way that allows others to extract" it. The source
// files never go in this repo, and the site serves only the scrambled binary, which src/dragon-model.ts unscrambles in
// memory. Scrambling stops a right-click save, not a determined reverse-engineer.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";

// FBXLoader expects a browser; it only touches these for textures, which are packed separately.
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
const warn = console.warn;
console.warn = () => {};
const THREE = await import("three");
const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
const { mergeVertices } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");

const src = process.argv[2];
if (!src) throw new Error("usage: node tools/pack-dragon.mjs <folder with Dragon.fbx, the Dragon_*.fbx clips and the textures>");
const out = new URL("../public/models/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

// The model is in centimetres; this puts its head about where the placeholder dragon's was.
const SCALE = 0.0065;
// Share of each material's triangles kept. The body is most of the 28k; up to nine dragons can be on screen.
const KEEP = { body: 0.45, pattern: 0.6, wing: 1, eye: 1 };
const MATERIALS = { DragonBody: "body", DragonBackPattern: "pattern", DragonWing: "wing", DragonEye: "eye" };
const CLIPS = ["Idle", "Walk_WingsDown", "Walk_WingsUp", "WingsFlap", "Fly", "Attack", "Bow", "Fallback", "HeadTurn_Left", "HeadTurn_Right"];
const FPS = 25;

const load = (file) => {
  const b = readFileSync(join(src, file));
  return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), "");
};

// Babylon is left-handed: mirroring x keeps the dragon facing +z, as the game's dragons do. Left and right swap,
// so HeadTurn_Left turns it to its right.
const mirrorPoint = (v) => [-v.x * SCALE, v.y * SCALE, v.z * SCALE];
const mirrorQuat = (q) => [q.x, -q.y, -q.z, q.w];

const model = load("Dragon.fbx");
model.updateMatrixWorld(true);
const skinned = [];
model.traverse((o) => o.isSkinnedMesh && skinned.push(o));

// Bones: every node the skins use, and their ancestors, so the hierarchy is whole. First found wins, as in three.
const bones = [];
const boneIndex = new Map();
const addBone = (node) => {
  if (node === model || boneIndex.has(node)) return;
  addBone(node.parent);
  boneIndex.set(node, bones.length);
  bones.push(node);
};
for (const m of skinned) m.skeleton.bones.forEach(addBone);

// Where each bone was when the skins were bound, in world space. Most bones are bound where the file leaves them;
// the wings were bound in another pose.
const bindWorld = new Map();
for (const m of skinned) {
  if (m.bindMatrix.elements.some((v, k) => Math.abs(v - m.matrixWorld.elements[k]) > 1e-4)) throw new Error(`${m.name} moved after binding`);
  m.skeleton.bones.forEach((b, i) => {
    const bind = m.skeleton.boneInverses[i].clone().invert();
    const seen = bindWorld.get(b);
    if (seen && seen.elements.some((v, k) => Math.abs(v - bind.elements[k]) > 1e-2)) throw new Error(`${b.name} is bound twice, differently`);
    bindWorld.set(b, bind);
  });
}
for (const b of bones) if (!bindWorld.has(b)) bindWorld.set(b, b.matrixWorld.clone());

// One vertex buffer for the whole dragon, in world space, with an index range per material.
const position = [];
const normal = [];
const uv = [];
const joints = [];
const weights = [];
const parts = {};
await MeshoptSimplifier.ready;
for (const m of skinned) {
  const g = mergeVertices(m.geometry, 1e-4);
  const base = position.length / 3;
  const world = m.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
  const a = g.attributes;
  for (let i = 0; i < a.position.count; i++) {
    position.push(...mirrorPoint(new THREE.Vector3().fromBufferAttribute(a.position, i).applyMatrix4(world)));
    const n = new THREE.Vector3().fromBufferAttribute(a.normal, i).applyMatrix3(normalMatrix).normalize();
    normal.push(-n.x, n.y, n.z);
    uv.push(a.uv.getX(i), a.uv.getY(i));
    const w = [0, 1, 2, 3].map((k) => a.skinWeight.getComponent(i, k));
    const sum = w.reduce((s, v) => s + v, 0) || 1;
    for (let k = 0; k < 4; k++) {
      joints.push(w[k] > 0 ? boneIndex.get(m.skeleton.bones[a.skinIndex.getComponent(i, k)]) : 0);
      weights.push(w[k] / sum);
    }
  }
  const materials = [m.material].flat();
  for (const group of g.groups.length ? g.groups : [{ start: 0, count: g.index.count, materialIndex: 0 }]) {
    const name = MATERIALS[materials[group.materialIndex].name];
    const list = (parts[name] ??= []);
    for (let k = group.start; k < group.start + group.count; k++) list.push(base + g.index.getX(k));
  }
}

const positions = Float32Array.from(position);
let triangles = 0;
const indexRanges = {};
const allIndices = [];
for (const [name, list] of Object.entries(parts)) {
  // Mirroring turned the faces inside out; swapping two corners turns them back.
  let indices = Uint32Array.from(list);
  for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  if (KEEP[name] < 1) {
    const target = Math.floor((indices.length * KEEP[name]) / 3) * 3;
    [indices] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.02);
  }
  indexRanges[name] = { start: allIndices.length, count: indices.length };
  allIndices.push(...indices);
  triangles += indices.length / 3;
  warn(`${name.padEnd(8)} ${list.length / 3} → ${indices.length / 3} triangles`);
}

// Only the vertices the triangles still use, renumbered.
const remap = new Map();
const indices = allIndices.map((i) => {
  if (!remap.has(i)) remap.set(i, remap.size);
  return remap.get(i);
});
const pick = (data, width) => {
  const result = new Float32Array(remap.size * width);
  for (const [from, to] of remap) for (let j = 0; j < width; j++) result[to * width + j] = data[from * width + j];
  return result;
};
const vertices = remap.size;
const pos = pick(position, 3);
const min = [0, 1, 2].map((k) => Math.min(...pos.filter((_, i) => i % 3 === k)));
const max = [0, 1, 2].map((k) => Math.max(...pos.filter((_, i) => i % 3 === k)));
const uvs = pick(uv, 2);
const uvMin = [0, 1].map((k) => Math.min(...uvs.filter((_, i) => i % 2 === k)));
const uvMax = [0, 1].map((k) => Math.max(...uvs.filter((_, i) => i % 2 === k)));
const q16 = (v, lo, hi) => Math.round(((v - lo) / (hi - lo || 1)) * 65535);

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

// Weights as bytes that still add up to 255, the largest taking the rounding.
const w8 = new Uint8Array(vertices * 4);
const w = pick(weights, 4);
for (let v = 0; v < vertices; v++) {
  let sum = 0;
  let top = 0;
  for (let k = 0; k < 4; k++) {
    w8[v * 4 + k] = Math.round(w[v * 4 + k] * 255);
    sum += w8[v * 4 + k];
    if (w[v * 4 + k] > w[v * 4 + top]) top = k;
  }
  w8[v * 4 + top] += 255 - sum;
}

const mesh = {
  vertices,
  triangles,
  min,
  max,
  uvMin,
  uvMax,
  parts: indexRanges,
  position: put(Uint16Array.from(pos, (v, i) => q16(v, min[i % 3], max[i % 3]))),
  normal: put(Int8Array.from(pick(normal, 3), (v) => Math.round(v * 127))),
  uv: put(Uint16Array.from(uvs, (v, i) => q16(v, uvMin[i % 2], uvMax[i % 2]))),
  joints: put(Uint8Array.from(pick(joints, 4))),
  weights: put(w8),
  indices: put(vertices > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices)),
};

// A bone's place relative to its parent, mirrored and scaled like the vertices.
const local = (world, parentWorld) => {
  const m = parentWorld ? parentWorld.clone().invert().multiply(world) : world.clone();
  const t = new THREE.Vector3();
  const r = new THREE.Quaternion();
  m.decompose(t, r, new THREE.Vector3());
  return { position: mirrorPoint(t), rotation: mirrorQuat(r) };
};
const skeleton = bones.map((b) => {
  const parent = b.parent === model ? undefined : b.parent;
  const bind = local(bindWorld.get(b), parent && bindWorld.get(parent));
  return {
    name: b.name,
    parent: parent ? boneIndex.get(parent) : -1,
    position: mirrorPoint(b.position),
    rotation: mirrorQuat(b.quaternion),
    bindPosition: bind.position,
    bindRotation: bind.rotation,
  };
});
for (const b of bones) {
  if (Math.abs(b.scale.x - 1) + Math.abs(b.scale.y - 1) + Math.abs(b.scale.z - 1) > 1e-3) throw new Error(`${b.name} is scaled`);
}

// Clips: a track for every bone any clip moves, so switching clips never leaves a bone where the last one put it.
// Each track is one key when it holds still, or a key every frame.
const byName = new Map();
for (const b of bones) if (!byName.has(b.name)) byName.set(b.name, boneIndex.get(b));
// FBXLoader turns a rotation that holds still into a one-number track; those are skipped, and the bone takes its
// pose from the clip's own file instead.
const valid = (t) => t.values.length === t.times.length * (t.name.endsWith(".quaternion") ? 4 : 3);
const clips = CLIPS.map((name) => {
  const scene = load(`Dragon_${name}.fbx`);
  return { name, scene, clip: scene.animations[0] };
});
const moved = new Set();
for (const { clip } of clips) for (const t of clip.tracks.filter(valid)) {
  const [node, property] = t.name.split(".");
  if (byName.has(node) && (property === "quaternion" || property === "position")) moved.add(`${byName.get(node)}.${property}`);
}
const packedClips = clips.map(({ name, scene, clip }) => {
  const frames = Math.round(clip.duration * FPS) + 1;
  const found = new Map();
  for (const t of clip.tracks.filter(valid)) {
    const [node, property] = t.name.split(".");
    if (byName.has(node)) found.set(`${byName.get(node)}.${property}`, t);
  }
  const tracks = [...moved].sort().map((key) => {
    const [bone, property] = key.split(".");
    const still = scene.getObjectByName(skeleton[bone].name);
    const rest = property === "quaternion" ? (still ? mirrorQuat(still.quaternion) : skeleton[bone].rotation) : still ? mirrorPoint(still.position) : skeleton[bone].position;
    const t = found.get(key);
    let keys = [rest];
    if (t) {
      const interpolant = t.createInterpolant();
      keys = Array.from({ length: frames }, (_, f) => {
        const v = interpolant.evaluate(Math.min(f / FPS, clip.duration));
        return property === "quaternion" ? mirrorQuat({ x: v[0], y: v[1], z: v[2], w: v[3] }) : mirrorPoint({ x: v[0], y: v[1], z: v[2] });
      });
      if (keys.every((k) => k.every((v, j) => Math.abs(v - keys[0][j]) < 1e-4))) keys = [keys[0]];
    }
    const values = keys.flat();
    return {
      bone: Number(bone),
      property: property === "quaternion" ? "rotation" : "position",
      keys: keys.length,
      at: property === "quaternion" ? put(Int16Array.from(values, (v) => Math.round(v * 32767))) : put(Float32Array.from(values)),
    };
  });
  return { name, frames, fps: FPS, tracks };
});

// Textures, through Blender for its image library.
const tex = mkdtempSync(join(tmpdir(), "dragon-"));
execFileSync("/Applications/Blender.app/Contents/MacOS/Blender", ["-b", "--python", new URL("dragon-textures.py", import.meta.url).pathname, "--", src, tex], { stdio: "ignore" });
const textures = {};
for (const file of ["body.jpg", "wing.jpg", "wing-mask.png", "pattern.jpg", "pattern-mask.png", "eye.jpg", "blink.jpg"]) {
  const bytes = readFileSync(join(tex, file));
  textures[file] = { at: put(new Uint8Array(bytes)), length: bytes.length };
}

const header = new TextEncoder().encode(JSON.stringify({ mesh, skeleton, clips: packedClips, textures }));
const headerPad = (4 - (header.length % 4)) % 4;
const padded = new Uint8Array(header.length + headerPad).fill(32);
padded.set(header);
const plain = new Uint8Array(Buffer.concat([Buffer.from(new Uint32Array([padded.length]).buffer), Buffer.from(padded), ...chunks.map((c) => Buffer.from(c))]));

// Scrambled with an xorshift stream; src/dragon-model.ts runs the same stream to undo it.
const words = new Uint32Array(plain.buffer, plain.byteOffset, plain.length / 4);
let s = 0x9e3779b9;
for (let i = 0; i < words.length; i++) {
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  words[i] ^= s;
}
writeFileSync(join(out, "dragon.bin"), plain);
warn(`dragon: ${vertices} vertices, ${triangles} triangles, ${bones.length} bones, ${moved.size} tracks a clip, ${(plain.length / 1024).toFixed(0)} KB`);
