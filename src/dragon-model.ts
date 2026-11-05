import {
  Animation,
  AnimationGroup,
  Bone,
  BoundingInfo,
  Color3,
  type Material,
  type MaterialDefines,
  MaterialPluginBase,
  Matrix,
  Mesh,
  MultiMaterial,
  Quaternion,
  Scene,
  Skeleton,
  StandardMaterial,
  SubMesh,
  Texture,
  TransformNode,
  type UniformBuffer,
  Vector3,
  VertexData,
} from "./babylon";

// Toon Dragons by SPiN AG, packed by tools/pack-dragon.mjs into public/models/dragon.bin. The model is paid for and
// its license bars shipping it where it can be pulled out, so the file is scrambled and only unscrambled here.
// One painted red skin becomes every dragon's colors: a shader maps its shading onto the dragon's body, belly and wings.

type Part = "body" | "pattern" | "wing" | "eye";
type Clip = "Idle" | "Walk_WingsDown" | "Walk_WingsUp" | "WingsFlap" | "Fly" | "Attack" | "Bow" | "Fallback" | "HeadTurn_Left" | "HeadTurn_Right";

interface Packed {
  mesh: {
    vertices: number;
    min: number[];
    max: number[];
    uvMin: number[];
    uvMax: number[];
    parts: Record<Part, { start: number; count: number }>;
    position: number;
    normal: number;
    uv: number;
    joints: number;
    weights: number;
    indices: number;
  };
  skeleton: { name: string; parent: number; position: number[]; rotation: number[]; bindPosition: number[]; bindRotation: number[] }[];
  clips: { name: Clip; frames: number; fps: number; tracks: { bone: number; property: "rotation" | "position"; keys: number; at: number }[] }[];
  textures: Record<string, { at: number; length: number }>;
}

// What the game asks a dragon to do, and the clip that does it. Loops repeat; the rest play once and go back.
export type Move = "idle" | "walk" | "fly" | "attack" | "hurt" | "roar" | "bow";
const MOVES: Record<Move, { clip: Clip; loop: boolean; speed: number }> = {
  idle: { clip: "Idle", loop: true, speed: 0.8 },
  walk: { clip: "Walk_WingsDown", loop: true, speed: 1.2 },
  fly: { clip: "Fly", loop: true, speed: 1 },
  attack: { clip: "Attack", loop: false, speed: 1.2 },
  hurt: { clip: "Fallback", loop: false, speed: 1.6 },
  roar: { clip: "WingsFlap", loop: false, speed: 1 },
  bow: { clip: "Bow", loop: false, speed: 1 },
};
const PARTS: Part[] = ["body", "pattern", "wing", "eye"];
const PART_INDEX = Object.fromEntries(PARTS.map((p, i) => [p, i])) as Record<Part, number>;

let packed: Packed;
let base: Mesh;
let textures: Record<"body" | "wing" | "pattern" | "eye" | "blink", Texture>;
let clips: { name: Clip; frames: number; tracks: { bone: number; animation: Animation }[] }[];
const SKULL = "Skull_00_jnt"; // holds still in every clip, so the game can tip the head up without fighting one
const SADDLE_BONE = "Spine_04_jnt";

function unscramble(words: Uint32Array) {
  let s = 0x9e3779b9;
  for (let i = 0; i < words.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    words[i] ^= s;
  }
}

// The wing and back pattern are cut out: their colors come as a JPEG and the cut as a mask, joined here.
async function cutOut(color: Blob, mask: Blob): Promise<Blob> {
  const [c, m] = await Promise.all([createImageBitmap(color), createImageBitmap(mask)]);
  const canvas = document.createElement("canvas");
  canvas.width = c.width;
  canvas.height = c.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(m, 0, 0, c.width, c.height);
  const cut = ctx.getImageData(0, 0, c.width, c.height).data;
  ctx.drawImage(c, 0, 0);
  const image = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < cut.length; i += 4) image.data[i] = cut[i - 3];
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

export async function loadDragonModel(scene: Scene): Promise<void> {
  const buffer = await (await fetch("models/dragon.bin")).arrayBuffer();
  unscramble(new Uint32Array(buffer));
  const headerLength = new Uint32Array(buffer, 0, 1)[0];
  packed = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)));
  const data = 4 + headerLength;
  const m = packed.mesh;

  const q = new Uint16Array(buffer, data + m.position, m.vertices * 3);
  const n = new Int8Array(buffer, data + m.normal, m.vertices * 3);
  const t = new Uint16Array(buffer, data + m.uv, m.vertices * 2);
  const vertexData = new VertexData();
  vertexData.positions = Float32Array.from(q, (v, i) => m.min[i % 3] + (v / 65535) * (m.max[i % 3] - m.min[i % 3]));
  vertexData.normals = Float32Array.from(n, (v) => v / 127);
  vertexData.uvs = Float32Array.from(t, (v, i) => m.uvMin[i % 2] + (v / 65535) * (m.uvMax[i % 2] - m.uvMin[i % 2]));
  vertexData.matricesIndices = Float32Array.from(new Uint8Array(buffer, data + m.joints, m.vertices * 4));
  vertexData.matricesWeights = Float32Array.from(new Uint8Array(buffer, data + m.weights, m.vertices * 4), (v) => v / 255);
  const triangles = Object.values(m.parts).reduce((s, p) => s + p.count, 0);
  vertexData.indices = m.vertices > 65535 ? new Uint32Array(buffer, data + m.indices, triangles) : Uint32Array.from(new Uint16Array(buffer, data + m.indices, triangles));
  base = new Mesh("dragonModel", scene);
  vertexData.applyToMesh(base);
  base.numBoneInfluencers = 4;
  base.subMeshes = [];
  for (const part of PARTS) new SubMesh(PART_INDEX[part], 0, m.vertices, m.parts[part].start, m.parts[part].count, base);
  base.setEnabled(false);

  const blob = (file: string, type: string) => {
    const { at, length } = packed.textures[file];
    return new Blob([new Uint8Array(buffer, data + at, length)], { type });
  };
  const texture = (name: string, image: Blob) => {
    const tex = new Texture(`data:dragon-${name}`, scene, { buffer: image });
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    return tex;
  };
  const [wing, pattern] = await Promise.all([
    cutOut(blob("wing.jpg", "image/jpeg"), blob("wing-mask.png", "image/png")),
    cutOut(blob("pattern.jpg", "image/jpeg"), blob("pattern-mask.png", "image/png")),
  ]);
  textures = {
    body: texture("body", blob("body.jpg", "image/jpeg")),
    wing: texture("wing", wing),
    pattern: texture("pattern", pattern),
    eye: texture("eye", blob("eye.jpg", "image/jpeg")),
    blink: texture("blink", blob("blink.jpg", "image/jpeg")),
  };
  textures.wing.hasAlpha = textures.pattern.hasAlpha = true;

  // Clips are shared; each dragon points them at its own bones.
  clips = packed.clips.map((c) => ({
    name: c.name,
    frames: c.frames,
    tracks: c.tracks.map((track) => {
      const rotation = track.property === "rotation";
      const animation = new Animation(
        `${c.name}.${track.bone}.${track.property}`,
        rotation ? "rotationQuaternion" : "position",
        c.fps,
        rotation ? Animation.ANIMATIONTYPE_QUATERNION : Animation.ANIMATIONTYPE_VECTOR3,
        Animation.ANIMATIONLOOPMODE_CYCLE,
      );
      const values = rotation ? new Int16Array(buffer, data + track.at, track.keys * 4) : new Float32Array(buffer, data + track.at, track.keys * 3);
      const keys = Array.from({ length: track.keys }, (_, k) => ({
        frame: k,
        value: rotation
          ? new Quaternion(values[k * 4] / 32767, values[k * 4 + 1] / 32767, values[k * 4 + 2] / 32767, values[k * 4 + 3] / 32767).normalize()
          : new Vector3(values[k * 3], values[k * 3 + 1], values[k * 3 + 2]),
      }));
      // A bone holding still gets the same value at both ends, so every track spans the clip.
      if (keys.length === 1) keys.push({ frame: c.frames - 1, value: keys[0].value });
      animation.setKeys(keys);
      return { bone: track.bone, animation };
    }),
  }));
}

// Maps the painted skin's shading onto three colors: shadow, the dragon's color, and its belly. Where the paint isn't
// red (teeth, claws, the eye's iris) it's left alone, unless the part is all recolored (wings).
class Recolor extends MaterialPluginBase {
  dark = Color3.Black();
  mid = Color3.Black();
  light = Color3.Black();
  lava = Color3.Black(); // glows in the lightest parts: the black dragon's belly
  all = false;
  range = [0.02, 0.36]; // the paint's shading that spans shadow to belly

  constructor(material: Material) {
    super(material, "Recolor", 200, { RECOLOR: false });
    this._enable(true);
  }

  prepareDefines(defines: MaterialDefines) {
    defines.RECOLOR = true;
  }

  getClassName() {
    return "Recolor";
  }

  getUniforms() {
    return {
      ubo: [
        { name: "recolorDark", size: 3, type: "vec3" },
        { name: "recolorMid", size: 3, type: "vec3" },
        { name: "recolorLight", size: 3, type: "vec3" },
        { name: "recolorLava", size: 3, type: "vec3" },
        { name: "recolorAll", size: 1, type: "float" },
        { name: "recolorRange", size: 2, type: "vec2" },
      ],
      fragment: `#ifdef RECOLOR
        uniform vec3 recolorDark;
        uniform vec3 recolorMid;
        uniform vec3 recolorLight;
        uniform vec3 recolorLava;
        uniform float recolorAll;
        uniform vec2 recolorRange;
      #endif`,
    };
  }

  bindForSubMesh(ubo: UniformBuffer) {
    ubo.updateColor3("recolorDark", this.dark);
    ubo.updateColor3("recolorMid", this.mid);
    ubo.updateColor3("recolorLight", this.light);
    ubo.updateColor3("recolorLava", this.lava);
    ubo.updateFloat("recolorAll", this.all ? 1 : 0);
    ubo.updateFloat2("recolorRange", this.range[0], this.range[1]);
  }

  getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "float recolorT; float recolorM;",
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        vec3 paint = baseColor.rgb;
        float shade = dot(paint, vec3(0.299, 0.587, 0.114));
        float red = clamp((paint.r - max(paint.g, paint.b)) / max(paint.r, 0.001), 0.0, 1.0);
        recolorM = max(recolorAll, smoothstep(0.15, 0.4, red));
        recolorT = clamp((shade - recolorRange.x) / (recolorRange.y - recolorRange.x), 0.0, 1.0);
        vec3 mapped = recolorT < 0.5 ? mix(recolorDark, recolorMid, recolorT * 2.0) : mix(recolorMid, recolorLight, recolorT * 2.0 - 1.0);
        baseColor.rgb = mix(paint, mapped, recolorM);
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: "color.rgb += recolorLava * smoothstep(0.5, 0.85, recolorT) * recolorM;",
    };
  }
}

export interface DragonBody {
  mesh: Mesh;
  skeleton: Skeleton;
  head: TransformNode; // the snout, where breath comes from
  skin: StandardMaterial;
  materials: StandardMaterial[];
  headTop: number; // the top of the head at rest, in the dragon's own units
  headZ: number;
  saddle: TransformNode; // where a rider sits, rising and falling with the back but never tipping
  mount(at: Vector3): TransformNode; // a node that sits at this rest-pose spot and moves with the head
  play(move: Move): void;
  look(pitch: number): void; // tips the head up (negative) or down, on top of whatever clip is playing
  dispose(): void;
}

function material(scene: Scene, name: string, texture: Texture, colors: [Color3, Color3, Color3], range: number[], all: boolean, cut: boolean): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = texture;
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  if (cut) {
    m.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
    // With a transparency mode set, the test reads the material's alpha, which takes the texture's only with this.
    m.useAlphaFromDiffuseTexture = true;
    m.alphaCutOff = 0.5;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
  }
  const recolor = new Recolor(m);
  [recolor.dark, recolor.mid, recolor.light] = colors;
  recolor.all = all;
  recolor.range = range;
  (m as StandardMaterial & { recolor: Recolor }).recolor = recolor;
  return m;
}

export function recolorOf(m: StandardMaterial): Recolor {
  return (m as StandardMaterial & { recolor: Recolor }).recolor;
}

export function makeDragonBody(scene: Scene, id: string, parent: TransformNode, colors: { body: Color3; belly: Color3; wings: Color3 }): DragonBody {
  const skeleton = new Skeleton(id, id, scene);
  const rest: Quaternion[] = [];
  for (const b of packed.skeleton) {
    const rotation = Quaternion.FromArray(b.rotation);
    rest.push(rotation);
    const local = Matrix.Compose(Vector3.One(), rotation, Vector3.FromArray(b.position));
    const bind = Matrix.Compose(Vector3.One(), Quaternion.FromArray(b.bindRotation), Vector3.FromArray(b.bindPosition));
    new Bone(b.name, skeleton, b.parent >= 0 ? skeleton.bones[b.parent] : null, local, local.clone(), bind);
  }
  const mesh = base.clone(`${id}Body`, parent);
  mesh.setEnabled(true);
  mesh.skeleton = skeleton;
  mesh.isPickable = true;
  // Clips swing wings and tail past the resting shape, so it's culled by a box that holds them.
  const { min, max } = packed.mesh;
  mesh.setBoundingInfo(new BoundingInfo(new Vector3(min[0] * 1.3, 0, min[2] * 1.2), new Vector3(max[0] * 1.3, max[1] * 1.4, max[2] * 1.6)));

  const { body, belly, wings } = colors;
  const skin = material(scene, `${id}Skin`, textures.body, [body.scale(0.55), body, belly], [0.02, 0.36], false, false);
  const pattern = material(scene, `${id}Pattern`, textures.pattern, [wings.scale(0.2), wings.scale(0.6), wings], [0, 0.4], true, true);
  const wing = material(scene, `${id}Wing`, textures.wing, [wings.scale(0.6), wings, Color3.Lerp(wings, Color3.White(), 0.35)], [0.05, 0.9], true, true);
  const eye = material(scene, `${id}Eye`, textures.eye, [body.scale(0.55), body, belly], [0.02, 0.36], false, false);
  const multi = new MultiMaterial(`${id}Materials`, scene);
  multi.subMaterials = [skin, pattern, wing, eye];
  mesh.material = multi;

  const boneNamed = (name: string) => skeleton.bones.find((b) => b.name === name)!;
  const skull = boneNamed(SKULL);
  const skullRest = rest[skeleton.bones.indexOf(skull)];
  const head = new TransformNode(`${id}Head`, scene);
  head.attachToBone(boneNamed("Skull_01_jnt"), mesh);

  // Rest heights, from the bones' places when nothing plays.
  skeleton.computeAbsoluteMatrices(true);
  const restOf = (name: string) => boneNamed(name).getAbsoluteMatrix().getTranslation();
  const headTop = restOf(SKULL).y + 0.55;
  const headZ = restOf(SKULL).z;
  const back = boneNamed(SADDLE_BONE);
  const saddle = new TransformNode(`${id}Saddle`, scene);
  saddle.parent = parent;
  saddle.position.copyFrom(restOf(SADDLE_BONE)).addInPlace(new Vector3(0, 0.75, -0.1));

  const mounted: TransformNode[] = [];
  const mount = (at: Vector3) => {
    const anchor = new TransformNode(`${id}Mount`, scene);
    anchor.attachToBone(skull, mesh);
    const node = new TransformNode(`${id}Mounted`, scene);
    node.parent = anchor;
    // Undo the bone's own turn at rest, so the node's axes are the dragon's.
    Matrix.Translation(at.x, at.y, at.z).multiply(skull.getAbsoluteMatrix().clone().invert()).decompose(node.scaling, node.rotationQuaternion = new Quaternion(), node.position);
    mounted.push(anchor);
    return node;
  };

  const groups = new Map<Clip, AnimationGroup>();
  for (const c of clips) {
    const group = new AnimationGroup(`${id}.${c.name}`, scene);
    for (const t of c.tracks) group.addTargetedAnimation(t.animation, skeleton.bones[t.bone]);
    group.normalize(0, c.frames - 1);
    group.enableBlending = true;
    group.blendingSpeed = 0.12;
    groups.set(c.name, group);
  }
  const pace = 0.88 + Math.random() * 0.24;
  let loop: Move = "idle";
  let playing: Move | undefined;
  let stopping = false;
  let awake = true;
  const start = (move: Move) => {
    if (move === playing && MOVES[move].loop) return;
    // Stopping a one-off fires its end, which would start the loop underneath this move.
    stopping = true;
    if (playing) groups.get(MOVES[playing].clip)!.stop();
    stopping = false;
    playing = move;
    const { clip, loop: repeat, speed } = MOVES[move];
    const group = groups.get(clip)!;
    // Each dragon keeps its own beat, so a flock doesn't flap as one.
    group.start(repeat, repeat ? speed * pace : speed, 0, group.to);
    if (repeat) group.goToFrame(Math.random() * group.to);
    if (!awake) group.pause();
  };
  for (const group of groups.values()) {
    group.onAnimationGroupEndObservable.add(() => {
      if (!stopping && playing && groups.get(MOVES[playing].clip) === group && !MOVES[playing].loop) {
        playing = undefined;
        start(loop);
      }
    });
  }

  // A dragon the game has switched off (far away, or in a locked world) stops animating until it's back.
  const sleep = scene.onBeforeAnimationsObservable.add(() => {
    if (parent.isEnabled() === awake) return;
    awake = !awake;
    const group = playing && groups.get(MOVES[playing].clip);
    if (group) awake ? group.play(MOVES[playing!].loop) : group.pause();
  });

  let pitch = 0;
  const tip = new Quaternion();
  const at = new Vector3();
  const pose = scene.onAfterAnimationsObservable.add(() => {
    // The skull bone's x axis points to the dragon's left, so up is a negative turn for the game and a positive one here.
    Quaternion.RotationAxisToRef(Vector3.Right(), -pitch, tip);
    skull.setRotationQuaternion(skullRest.multiply(tip));
    if (!saddle.getChildren().length) return;
    skeleton.computeAbsoluteMatrices(true);
    back.getAbsoluteMatrix().getTranslationToRef(at);
    saddle.position.set(at.x, at.y + 0.75, at.z - 0.1);
  });

  // Blinks now and then, as the asset's own script does.
  let blinkAt = performance.now() + 2000 + Math.random() * 3000;
  const blink = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    if (now < blinkAt) return;
    const shut = eye.diffuseTexture === textures.blink;
    eye.diffuseTexture = shut ? textures.eye : textures.blink;
    blinkAt = now + (shut ? 2500 + Math.random() * 3000 : 140);
  });

  start("idle");
  return {
    mesh,
    skeleton,
    head,
    skin,
    materials: [skin, pattern, wing, eye],
    headTop,
    headZ,
    saddle,
    mount,
    play(move) {
      if (!MOVES[move].loop) return start(move);
      // A one-off in progress finishes first, then the new loop takes over.
      loop = move;
      if (!playing || MOVES[playing].loop) start(move);
    },
    look(p) {
      pitch = p;
    },
    dispose() {
      scene.onBeforeAnimationsObservable.remove(sleep);
      scene.onAfterAnimationsObservable.remove(pose);
      scene.onBeforeRenderObservable.remove(blink);
      for (const group of groups.values()) group.dispose();
      head.dispose();
      saddle.dispose(true);
      for (const m of mounted) m.dispose();
      mesh.dispose();
      multi.dispose();
      // The textures are shared by every dragon, so only the materials go.
      for (const m of [skin, pattern, wing, eye]) m.dispose(false, false);
      skeleton.dispose();
    },
  };
}
