import {
  BoundingInfo,
  Color3,
  Matrix,
  Mesh,
  MultiMaterial,
  Quaternion,
  Scene,
  Skeleton,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "./babylon";
import { makePlayer, makeSkeleton, type Model, type Packed, readModel, Recolor } from "./model-pack";

// Toon Dragons by SPiN AG, packed by tools/pack-dragon.mjs into public/models/dragon.bin and read by src/model-pack.ts.
// One painted red skin becomes every dragon's colors: a shader maps its shading onto the dragon's body, belly and wings.

type Part = "body" | "pattern" | "wing" | "eye";
type Clip = "Idle" | "Walk_WingsDown" | "Walk_WingsUp" | "WingsFlap" | "Fly" | "Attack" | "Bow" | "Fallback" | "HeadTurn_Left" | "HeadTurn_Right";

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

let model: Model<Packed<Part, Clip>>;
let textures: Record<"body" | "wing" | "pattern" | "eye" | "blink", Texture>;
const SKULL = "Skull_00_jnt"; // holds still in every clip, so the game can tip the head up without fighting one
const SADDLE_BONE = "Spine_04_jnt";

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
  model = await readModel<Packed<Part, Clip>>("models/dragon.bin", "dragonModel", scene, PARTS);
  const { blob } = model;
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
  const { skeleton, rest } = makeSkeleton(model.packed, id, scene);
  const mesh = model.base.clone(`${id}Body`, parent);
  mesh.setEnabled(true);
  mesh.skeleton = skeleton;
  mesh.isPickable = true;
  // Clips swing wings and tail past the resting shape, so it's culled by a box that holds them.
  const { min, max } = model.packed.mesh;
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

  // Each dragon keeps its own beat, so a flock doesn't flap as one.
  const player = makePlayer(scene, id, model, skeleton, MOVES, "idle", () => parent.isEnabled(), 0.88 + Math.random() * 0.24);

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
    play: player.play,
    look(p) {
      pitch = p;
    },
    dispose() {
      player.dispose();
      scene.onAfterAnimationsObservable.remove(pose);
      scene.onBeforeRenderObservable.remove(blink);
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
