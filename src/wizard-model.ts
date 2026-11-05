import { BoundingInfo, Color3, Matrix, Mesh, MultiMaterial, Quaternion, Scene, Skeleton, StandardMaterial, Texture, TransformNode, Vector3 } from "./babylon";
import { makePlayer, makeSkeleton, type Model, type Packed, readModel, Recolor } from "./model-pack";

// Hand Painted Wizard by Artcitizen, packed by tools/pack-wizard.mjs into public/models/wizard.bin and read by
// src/model-pack.ts. The painted robe and hat are blue; a shader maps their shading onto the robe color he picks.

type Part = "body" | "brim" | "stick";
type Clip = "idle1" | "idle2" | "run" | "cast" | "fireball" | "die";
type WizardPacked = Packed<Part, Clip> & { mesh: { tip: number[] } };

export type WizardMove = "idle" | "walk" | "cast" | "shield" | "nap" | "cheer";
const MOVES: Record<WizardMove, { clip: Clip; loop: boolean; speed: number }> = {
  idle: { clip: "idle1", loop: true, speed: 1 },
  walk: { clip: "run", loop: true, speed: 1.7 }, // he gets about at a jog; the walk clip would have to play five times over
  cast: { clip: "fireball", loop: false, speed: 1.6 },
  shield: { clip: "cast", loop: false, speed: 1.6 },
  nap: { clip: "die", loop: false, speed: 0.5 }, // lies down for the whole nap, then gets up where it starts
  cheer: { clip: "idle2", loop: false, speed: 1.4 }, // a look round, standing in until a cheer comes from Mixamo
};
const PARTS: Part[] = ["body", "brim", "stick"];

let model: Model<WizardPacked>;
let textures: { wizard: Texture; stick: Texture };

export async function loadWizardModel(scene: Scene): Promise<void> {
  model = await readModel<WizardPacked>("models/wizard.bin", "wizardModel", scene, PARTS);
  const texture = (name: string) => {
    const tex = new Texture(`data:wizard-${name}`, scene, { buffer: model.blob(`${name}.jpg`, "image/jpeg") });
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    return tex;
  };
  textures = { wizard: texture("wizard"), stick: texture("stick") };
}

export interface WizardBody {
  mesh: Mesh;
  skeleton: Skeleton;
  robe: Recolor;
  staff: Recolor;
  crystal: TransformNode; // the staff's top, moving with the hand
  brim(on: boolean): void; // the hat with its brim, or without it as a hood
  play(move: WizardMove): void;
}

function material(scene: Scene, name: string, texture: Texture): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = texture;
  m.specularColor = new Color3(0.06, 0.06, 0.06);
  return m;
}

export function makeWizardBody(scene: Scene, parent: TransformNode): WizardBody {
  const { skeleton } = makeSkeleton(model.packed, "wizard", scene);
  const mesh = model.base.clone("wizardBody", parent);
  mesh.setEnabled(true);
  mesh.skeleton = skeleton;
  mesh.isPickable = false;
  // The cast swings the staff out past the resting shape, so he's culled by a box that holds it.
  const { min, max } = model.packed.mesh;
  mesh.setBoundingInfo(new BoundingInfo(new Vector3(min[0] * 1.5, 0, min[2] * 2.5), new Vector3(max[0] * 1.5, max[1] * 1.2, max[2] * 2.5)));

  const skin = material(scene, "wizardSkin", textures.wizard);
  // The shading each paint spans, shadow to highlight.
  const robe = new Recolor(skin);
  robe.blue = true;
  robe.range = [0.03, 0.45];
  const stick = material(scene, "wizardStaff", textures.stick);
  const staff = new Recolor(stick);
  staff.all = true;
  staff.range = [0.1, 0.36];
  const multi = new MultiMaterial("wizardMaterials", scene);
  multi.subMaterials = [skin, skin, stick];
  mesh.material = multi;

  // The crystal rides on the staff's bone, placed where the staff's top is at rest.
  const bone = skeleton.bones.find((b) => b.name === "StickBone")!;
  skeleton.computeAbsoluteMatrices(true);
  const anchor = new TransformNode("staffBone", scene);
  anchor.attachToBone(bone, mesh);
  const crystal = new TransformNode("tip", scene);
  crystal.parent = anchor;
  const [x, y, z] = model.packed.mesh.tip;
  // Undo the bone's own turn at rest, so the crystal stands upright.
  Matrix.Translation(x, y, z).multiply(bone.getAbsoluteMatrix().clone().invert()).decompose(crystal.scaling, (crystal.rotationQuaternion = new Quaternion()), crystal.position);

  const player = makePlayer(scene, "wizard", model, skeleton, MOVES, "idle", () => true);
  const [body, brim, rod] = mesh.subMeshes;
  return {
    mesh,
    skeleton,
    robe,
    staff,
    crystal,
    brim(on) {
      mesh.subMeshes = on ? [body, brim, rod] : [body, rod];
    },
    play: player.play,
  };
}
