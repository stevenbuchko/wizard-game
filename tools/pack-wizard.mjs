// Packs Hand Painted Wizard by Artcitizen (Unity Asset Store) into public/models/wizard.bin: the skinned wizard with
// his staff on the hand bone, his clips and his two textures, scrambled like the dragon. Run on a Mac:
//   node tools/pack-wizard.mjs ~/wizard-game-models/wizard/src
// The license bars shipping the model "in a way that allows others to extract" it, so the source files never go in
// this repo; src/wizard-model.ts unscrambles the binary in memory. See tools/pack-dragon.mjs, which this follows.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
if (!src) throw new Error("usage: node tools/pack-wizard.mjs <folder with Wizard.fbx, Stick.fbx, the clip FBX files and the textures>");
const out = new URL("../public/models/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

// The model is in centimetres and 1.8 m tall. He is slimmer than the placeholder wizard was, so he stands a little taller
// to read as well from the play camera.
const SCALE = 0.0145;
// Each file holds a one-frame "default" take beside its real one, which is the longer.
const CLIPS = ["idle1", "idle2", "run", "cast", "fireball", "die"];
const FPS = 30;
// The hat's brim comes off for the hood: the pieces of the painted layout that sit between his brow and the hat's crown
// and reach out past the head, in the model's centimetres, measured from the axis through his head.
const BRIM = { above: 126, below: 150, reach: 25, head: [0, 2] };

const load = (file) => {
  const b = readFileSync(join(src, file));
  return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), "");
};

// Babylon is left-handed: mirroring x keeps him facing +z, as the game's wizard does.
const mirrorPoint = (v) => [-v.x * SCALE, v.y * SCALE, v.z * SCALE];
const mirrorQuat = (q) => [q.x, -q.y, -q.z, q.w];

const model = load("Wizard.fbx");
model.updateMatrixWorld(true);
let wizard;
model.traverse((o) => o.isSkinnedMesh && (wizard = o));
const stick = load("Stick.fbx");
stick.updateMatrixWorld(true);
let staff;
stick.traverse((o) => o.isMesh && (staff = o));

// Bones: every node the skin uses, and their ancestors, so the hierarchy is whole.
const bones = [];
const boneIndex = new Map();
const addBone = (node) => {
  if (node === model || boneIndex.has(node)) return;
  addBone(node.parent);
  boneIndex.set(node, bones.length);
  bones.push(node);
};
wizard.skeleton.bones.forEach(addBone);
const bindWorld = new Map();
if (wizard.bindMatrix.elements.some((v, k) => Math.abs(v - wizard.matrixWorld.elements[k]) > 1e-4)) throw new Error("the wizard moved after binding");
wizard.skeleton.bones.forEach((b, i) => bindWorld.set(b, wizard.skeleton.boneInverses[i].clone().invert()));
for (const b of bones) if (!bindWorld.has(b)) bindWorld.set(b, b.matrixWorld.clone());
const stickBone = bones.find((b) => b.name === "StickBone");

// One vertex buffer, in world space, with an index range per part. The staff file sits where the hand holds it, so
// it goes in whole on the stick bone.
const position = [];
const normal = [];
const uv = [];
const joints = [];
const weights = [];
const parts = { body: [], brim: [], stick: [] };
const add = (mesh, skin) => {
  const g = mergeVertices(mesh.geometry, 1e-4);
  const base = position.length / 3;
  const world = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
  const a = g.attributes;
  const at = [];
  for (let i = 0; i < a.position.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(a.position, i).applyMatrix4(world);
    at.push(p);
    position.push(...mirrorPoint(p));
    const n = new THREE.Vector3().fromBufferAttribute(a.normal, i).applyMatrix3(normalMatrix).normalize();
    normal.push(-n.x, n.y, n.z);
    uv.push(a.uv.getX(i), a.uv.getY(i));
    const w = skin ? [0, 1, 2, 3].map((k) => a.skinWeight.getComponent(i, k)) : [1, 0, 0, 0];
    const sum = w.reduce((s, v) => s + v, 0) || 1;
    for (let k = 0; k < 4; k++) {
      joints.push(w[k] > 0 ? (skin ? boneIndex.get(mesh.skeleton.bones[a.skinIndex.getComponent(i, k)]) : boneIndex.get(stickBone)) : 0);
      weights.push(w[k] / sum);
    }
  }
  // Pieces: triangles joined by shared corners, which after welding means one island of the painted layout.
  const piece = Array.from({ length: a.position.count }, (_, i) => i);
  const find = (i) => (piece[i] === i ? i : (piece[i] = find(piece[i])));
  for (let k = 0; k < g.index.count; k += 3) for (let c = 1; c < 3; c++) piece[find(g.index.getX(k + c))] = find(g.index.getX(k));
  const brim = new Map();
  for (let i = 0; i < at.length; i++) {
    const r = Math.hypot(at[i].x - BRIM.head[0], at[i].z - BRIM.head[1]);
    const e = brim.get(find(i)) ?? { low: Infinity, high: -Infinity, reach: 0 };
    brim.set(find(i), { low: Math.min(e.low, at[i].y), high: Math.max(e.high, at[i].y), reach: Math.max(e.reach, r) });
  }
  const isBrim = (i) => {
    const e = brim.get(find(i));
    return e.low > BRIM.above && e.high < BRIM.below && e.reach > BRIM.reach;
  };
  for (let k = 0; k < g.index.count; k += 3) {
    const corners = [0, 1, 2].map((c) => g.index.getX(k + c));
    const part = !skin ? "stick" : isBrim(corners[0]) ? "brim" : "body";
    parts[part].push(...corners.map((c) => base + c));
  }
};
add(wizard, true);
add(staff, false);

// Babylon draws a face's front where its corners go clockwise, so the cross of its edges points against its painted
// normals. The dragon's files needed every face turned after mirroring; this one's come out the right way already, so
// each part goes by what most of its faces say.
const P = (i) => new THREE.Vector3(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
const N = (i) => new THREE.Vector3(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
const allIndices = [];
const indexRanges = {};
let triangles = 0;
let turned = 0;
for (const [name, list] of Object.entries(parts)) {
  let wrong = 0;
  for (let t = 0; t < list.length; t += 3) {
    const [a, b, c] = list.slice(t, t + 3);
    if (P(b).sub(P(a)).cross(P(c).sub(P(a))).dot(N(a).add(N(b)).add(N(c))) > 0) wrong++;
  }
  if (wrong > list.length / 6) {
    for (let t = 0; t < list.length; t += 3) [list[t + 1], list[t + 2]] = [list[t + 2], list[t + 1]];
    turned += list.length / 3;
  }
  indexRanges[name] = { start: allIndices.length, count: list.length };
  allIndices.push(...list);
  triangles += list.length / 3;
  warn(`${name.padEnd(6)} ${list.length / 3} triangles`);
}

const vertices = position.length / 3;
const min = [0, 1, 2].map((k) => Math.min(...position.filter((_, i) => i % 3 === k)));
const max = [0, 1, 2].map((k) => Math.max(...position.filter((_, i) => i % 3 === k)));
const uvMin = [0, 1].map((k) => Math.min(...uv.filter((_, i) => i % 2 === k)));
const uvMax = [0, 1].map((k) => Math.max(...uv.filter((_, i) => i % 2 === k)));
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
for (let v = 0; v < vertices; v++) {
  let sum = 0;
  let top = 0;
  for (let k = 0; k < 4; k++) {
    w8[v * 4 + k] = Math.round(weights[v * 4 + k] * 255);
    sum += w8[v * 4 + k];
    if (weights[v * 4 + k] > weights[v * 4 + top]) top = k;
  }
  w8[v * 4 + top] += 255 - sum;
}

// The staff's top, where the crystal sits: its highest point at rest.
let tip = [0, -Infinity, 0];
for (let i = indexRanges.stick.start; i < indexRanges.stick.start + indexRanges.stick.count; i++) {
  const v = allIndices[i];
  if (position[v * 3 + 1] > tip[1]) tip = position.slice(v * 3, v * 3 + 3);
}

const mesh = {
  vertices,
  triangles,
  min,
  max,
  uvMin,
  uvMax,
  parts: indexRanges,
  tip,
  position: put(Uint16Array.from(position, (v, i) => q16(v, min[i % 3], max[i % 3]))),
  normal: put(Int8Array.from(normal, (v) => Math.round(v * 127))),
  uv: put(Uint16Array.from(uv, (v, i) => q16(v, uvMin[i % 2], uvMax[i % 2]))),
  joints: put(Uint8Array.from(joints)),
  weights: put(w8),
  indices: put(vertices > 65535 ? Uint32Array.from(allIndices) : Uint16Array.from(allIndices)),
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
const byName = new Map(bones.map((b) => [b.name, boneIndex.get(b)]));
const clips = CLIPS.map((name) => {
  const scene = load(`${name}.fbx`);
  return { name, scene, clip: scene.animations.reduce((a, b) => (b.duration > a.duration ? b : a)) };
});
// Tracks that hold still count too: the clips hold bones away from where the model file leaves them.
const moved = new Set();
for (const { clip } of clips) for (const t of clip.tracks) {
  const [node, property] = t.name.split(".");
  if (byName.has(node) && (property === "quaternion" || property === "position")) moved.add(`${byName.get(node)}.${property}`);
}
const packedClips = clips.map(({ name, scene, clip }) => {
  const frames = Math.round(clip.duration * FPS) + 1;
  const found = new Map();
  for (const t of clip.tracks) {
    const [node, property] = t.name.split(".");
    if (byName.has(node)) found.set(`${byName.get(node)}.${property}`, t);
  }
  const tracks = [...moved].sort().map((key) => {
    const [bone, property] = key.split(".");
    const still = scene.getObjectByName(skeleton[bone].name);
    const rest = property === "quaternion" ? mirrorQuat(still.quaternion) : mirrorPoint(still.position);
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

// Textures, shrunk by the Mac's own image tool. Neither uses its alpha.
const tex = mkdtempSync(join(tmpdir(), "wizard-"));
const textures = {};
for (const [file, from, size] of [["wizard.jpg", "WizardDif.png", 1024], ["stick.jpg", "StickDif.png", 512]]) {
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", String(size), join(src, from), "--out", join(tex, file)], { stdio: "ignore" });
  const bytes = readFileSync(join(tex, file));
  textures[file] = { at: put(new Uint8Array(bytes)), length: bytes.length };
}

const header = new TextEncoder().encode(JSON.stringify({ mesh, skeleton, clips: packedClips, textures }));
const headerPad = (4 - (header.length % 4)) % 4;
const padded = new Uint8Array(header.length + headerPad).fill(32);
padded.set(header);
const plain = new Uint8Array(Buffer.concat([Buffer.from(new Uint32Array([padded.length]).buffer), Buffer.from(padded), ...chunks.map((c) => Buffer.from(c))]));

// Scrambled with the dragon's xorshift stream; src/dragon-model.ts runs the same stream to undo it.
const words = new Uint32Array(plain.buffer, plain.byteOffset, plain.length / 4);
let s = 0x9e3779b9;
for (let i = 0; i < words.length; i++) {
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  words[i] ^= s;
}
writeFileSync(join(out, "wizard.bin"), plain);
warn(`${turned} faces turned`);
warn(`wizard: ${vertices} vertices, ${triangles} triangles, ${bones.length} bones, ${moved.size} tracks a clip, ${(plain.length / 1024).toFixed(0)} KB`);
