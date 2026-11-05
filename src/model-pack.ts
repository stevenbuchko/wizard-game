import {
  Animation,
  AnimationGroup,
  Bone,
  Color3,
  type Material,
  type MaterialDefines,
  MaterialPluginBase,
  Matrix,
  Mesh,
  Quaternion,
  Scene,
  Skeleton,
  SubMesh,
  type UniformBuffer,
  Vector3,
  VertexData,
} from "./babylon";

// Reads the bought models' packs, written by tools/pack-dragon.mjs and tools/pack-wizard.mjs: one skinned mesh with a
// range of triangles per part, its bones, its clips and its textures, scrambled. The licenses bar shipping the models
// where they can be pulled out, so the files are only unscrambled here, in memory.

export interface Packed<Part extends string = string, Clip extends string = string> {
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

export interface Model<P extends Packed> {
  packed: P;
  base: Mesh; // hidden; each character clones it
  blob(file: string, type: string): Blob;
  clips: { name: P["clips"][number]["name"]; frames: number; tracks: { bone: number; animation: Animation }[] }[];
}

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

export async function readModel<P extends Packed>(url: string, name: string, scene: Scene, parts: (keyof P["mesh"]["parts"] & string)[]): Promise<Model<P>> {
  const buffer = await (await fetch(url)).arrayBuffer();
  unscramble(new Uint32Array(buffer));
  const headerLength = new Uint32Array(buffer, 0, 1)[0];
  const packed: P = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)));
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
  const ranges = Object.values(m.parts) as { start: number; count: number }[];
  const triangles = ranges.reduce((s, p) => s + p.count, 0);
  vertexData.indices = m.vertices > 65535 ? new Uint32Array(buffer, data + m.indices, triangles) : Uint32Array.from(new Uint16Array(buffer, data + m.indices, triangles));
  const base = new Mesh(name, scene);
  vertexData.applyToMesh(base);
  base.numBoneInfluencers = 4;
  base.subMeshes = [];
  parts.forEach((part, i) => {
    const range = (m.parts as Record<string, { start: number; count: number }>)[part];
    new SubMesh(i, 0, m.vertices, range.start, range.count, base);
  });
  base.setEnabled(false);

  const blob = (file: string, type: string) => {
    const { at, length } = packed.textures[file];
    return new Blob([new Uint8Array(buffer, data + at, length)], { type });
  };

  // Clips are shared; each character points them at its own bones.
  const clips = packed.clips.map((c) => ({
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
  return { packed, base, blob, clips };
}

// A character's own bones, and each bone's turn at rest.
export function makeSkeleton(packed: Packed, id: string, scene: Scene): { skeleton: Skeleton; rest: Quaternion[] } {
  const skeleton = new Skeleton(id, id, scene);
  const rest: Quaternion[] = [];
  for (const b of packed.skeleton) {
    const rotation = Quaternion.FromArray(b.rotation);
    rest.push(rotation);
    const local = Matrix.Compose(Vector3.One(), rotation, Vector3.FromArray(b.position));
    const bind = Matrix.Compose(Vector3.One(), Quaternion.FromArray(b.bindRotation), Vector3.FromArray(b.bindPosition));
    new Bone(b.name, skeleton, b.parent >= 0 ? skeleton.bones[b.parent] : null, local, local.clone(), bind);
  }
  return { skeleton, rest };
}

export interface Player<Move extends string> {
  play(move: Move): void;
  dispose(): void;
}

// Plays what the game asks for. Loops repeat; the rest play once and go back to the loop underneath. A character the
// game has switched off stops animating until it's back.
export function makePlayer<Move extends string, Clip extends string>(
  scene: Scene,
  id: string,
  model: Model<Packed<string, Clip>>,
  skeleton: Skeleton,
  moves: Record<Move, { clip: Clip; loop: boolean; speed: number }>,
  first: Move,
  awake: () => boolean,
  pace = 1, // anything but 1 also starts each loop at a random frame, so a flock doesn't move as one
): Player<Move> {
  const groups = new Map<Clip, AnimationGroup>();
  for (const c of model.clips) {
    const group = new AnimationGroup(`${id}.${c.name}`, scene);
    for (const t of c.tracks) group.addTargetedAnimation(t.animation, skeleton.bones[t.bone]);
    group.normalize(0, c.frames - 1);
    group.enableBlending = true;
    group.blendingSpeed = 0.12;
    groups.set(c.name, group);
  }
  let loop = first;
  let playing: Move | undefined;
  let stopping = false;
  let running = true;
  const start = (move: Move) => {
    if (move === playing && moves[move].loop) return;
    // Stopping a one-off fires its end, which would start the loop underneath this move.
    stopping = true;
    if (playing) groups.get(moves[playing].clip)!.stop();
    stopping = false;
    playing = move;
    const { clip, loop: repeat, speed } = moves[move];
    const group = groups.get(clip)!;
    group.start(repeat, repeat ? speed * pace : speed, 0, group.to);
    if (repeat && pace !== 1) group.goToFrame(Math.random() * group.to);
    if (!running) group.pause();
  };
  for (const group of groups.values()) {
    group.onAnimationGroupEndObservable.add(() => {
      if (!stopping && playing && groups.get(moves[playing].clip) === group && !moves[playing].loop) {
        playing = undefined;
        start(loop);
      }
    });
  }
  const sleep = scene.onBeforeAnimationsObservable.add(() => {
    if (awake() === running) return;
    running = !running;
    const group = playing && groups.get(moves[playing].clip);
    if (group) running ? group.play(moves[playing!].loop) : group.pause();
  });
  start(first);
  return {
    play(move) {
      if (!moves[move].loop) return start(move);
      // A one-off in progress finishes first, then the new loop takes over.
      loop = move;
      if (!playing || moves[playing].loop) start(move);
    },
    dispose() {
      scene.onBeforeAnimationsObservable.remove(sleep);
      for (const group of groups.values()) group.dispose();
    },
  };
}

// Maps the painted skin's shading onto three colors: shadow, the dragon's color, and its belly. Where the paint isn't
// red (teeth, claws, the eye's iris) it's left alone, unless the part is all recolored (wings). The wizard's robe is
// painted blue, so it keys on blue instead.
export class Recolor extends MaterialPluginBase {
  dark = Color3.Black();
  mid = Color3.Black();
  light = Color3.Black();
  lava = Color3.Black(); // glows in the lightest parts: the black dragon's belly
  all = false;
  blue = false;
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
        { name: "recolorBlue", size: 1, type: "float" },
        { name: "recolorRange", size: 2, type: "vec2" },
      ],
      fragment: `#ifdef RECOLOR
        uniform vec3 recolorDark;
        uniform vec3 recolorMid;
        uniform vec3 recolorLight;
        uniform vec3 recolorLava;
        uniform float recolorAll;
        uniform float recolorBlue;
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
    ubo.updateFloat("recolorBlue", this.blue ? 1 : 0);
    ubo.updateFloat2("recolorRange", this.range[0], this.range[1]);
  }

  getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "float recolorT; float recolorM;",
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        vec3 paint = baseColor.rgb;
        float shade = dot(paint, vec3(0.299, 0.587, 0.114));
        vec3 keyed = recolorBlue > 0.5 ? paint.bgr : paint.rgb;
        float key = clamp((keyed.r - max(keyed.g, keyed.b)) / max(keyed.r, 0.001), 0.0, 1.0);
        recolorM = max(recolorAll, smoothstep(0.15, 0.4, key));
        recolorT = clamp((shade - recolorRange.x) / (recolorRange.y - recolorRange.x), 0.0, 1.0);
        vec3 mapped = recolorT < 0.5 ? mix(recolorDark, recolorMid, recolorT * 2.0) : mix(recolorMid, recolorLight, recolorT * 2.0 - 1.0);
        baseColor.rgb = mix(paint, mapped, recolorM);
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: "color.rgb += recolorLava * smoothstep(0.5, 0.85, recolorT) * recolorM;",
    };
  }
}
