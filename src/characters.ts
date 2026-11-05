import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from "./babylon";
import { type DragonBody, makeDragonBody, recolorOf } from "./dragon-model";
import type { DragonSpec, Element } from "./dragons";
import type { Look } from "./save";

// The wizard is still built from primitives; the dragons are the Toon Dragons model (src/dragon-model.ts).

export type Spell = Element | "shield";

export const SPELL_COLORS: Record<Spell, Color3> = {
  fire: new Color3(1, 0.45, 0.1),
  ice: new Color3(0.55, 0.85, 1),
  lightning: new Color3(1, 0.9, 0.2),
  shield: new Color3(0.65, 0.45, 1),
};

function material(scene: Scene, color: Color3, emissive = Color3.Black()): StandardMaterial {
  const m = new StandardMaterial("m", scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.15, 0.15, 0.15);
  m.emissiveColor = emissive;
  return m;
}

function part(mesh: Mesh, parent: TransformNode, mat: StandardMaterial, pos: Vector3): Mesh {
  mesh.material = mat;
  mesh.parent = parent;
  mesh.position = pos;
  mesh.isPickable = false;
  return mesh;
}

export interface Wizard {
  root: TransformNode;
  body: TransformNode;
  crystal: TransformNode; // the staff's tip, where spells start
  meshes: Mesh[];
  robe: StandardMaterial;
  trim: StandardMaterial;
  glow: StandardMaterial;
  wood: StandardMaterial;
  hat: Mesh[];
  hood: Mesh[];
  tips: Record<Look["staff"], Mesh>;
}

const STAFF_COLORS: Record<Look["staff"], Color3> = {
  wood: new Color3(0.45, 0.28, 0.12),
  gold: new Color3(0.85, 0.65, 0.2),
  shard: new Color3(0.88, 0.86, 0.94),
};

export function makeWizard(scene: Scene): Wizard {
  const root = new TransformNode("wizard", scene);
  const body = new TransformNode("wizardBody", scene);
  body.parent = root;
  const robe = material(scene, new Color3(0.16, 0.27, 0.62));
  const trim = material(scene, new Color3(0.1, 0.16, 0.4));
  const skin = material(scene, new Color3(0.96, 0.78, 0.66));
  const wood = material(scene, new Color3(0.45, 0.28, 0.12));
  const eye = material(scene, new Color3(0.1, 0.08, 0.15));
  const glow = material(scene, new Color3(0.4, 0.9, 1), new Color3(0.3, 0.8, 1));

  const meshes = [
    part(MeshBuilder.CreateCylinder("robe", { height: 1.4, diameterTop: 0.45, diameterBottom: 1.0, tessellation: 20 }, scene), body, robe, new Vector3(0, 0.7, 0)),
    part(MeshBuilder.CreateSphere("head", { diameter: 0.6 }, scene), body, skin, new Vector3(0, 1.65, 0)),
    part(MeshBuilder.CreateSphere("eyeL", { diameter: 0.09 }, scene), body, eye, new Vector3(-0.11, 1.7, 0.27)),
    part(MeshBuilder.CreateSphere("eyeR", { diameter: 0.09 }, scene), body, eye, new Vector3(0.11, 1.7, 0.27)),
    part(MeshBuilder.CreateCylinder("staff", { height: 2.0, diameter: 0.08 }, scene), body, wood, new Vector3(0.6, 1.0, 0.15)),
  ];
  const hood = [part(MeshBuilder.CreateCylinder("hood", { height: 1.0, diameterTop: 0, diameterBottom: 0.75, tessellation: 20 }, scene), body, trim, new Vector3(0, 2.25, -0.05))];
  const cone = part(MeshBuilder.CreateCylinder("hat", { height: 1.3, diameterTop: 0, diameterBottom: 0.62, tessellation: 20 }, scene), body, trim, new Vector3(0, 2.5, -0.05));
  cone.rotation.x = -0.15;
  const hat = [cone, part(MeshBuilder.CreateCylinder("brim", { height: 0.05, diameter: 1.1, tessellation: 24 }, scene), body, trim, new Vector3(0, 1.88, 0))];
  const crystal = new TransformNode("tip", scene);
  crystal.parent = body;
  crystal.position = new Vector3(0.6, 2.05, 0.15);
  const tips = {
    wood: part(MeshBuilder.CreateSphere("orb", { diameter: 0.26 }, scene), crystal, glow, Vector3.Zero()),
    gold: part(MeshBuilder.CreatePolyhedron("star", { type: 1, size: 0.2 }, scene), crystal, glow, new Vector3(0, 0.05, 0)),
    shard: part(MeshBuilder.CreatePolyhedron("shard", { type: 1, sizeX: 0.12, sizeY: 0.34, sizeZ: 0.12 }, scene), crystal, glow, new Vector3(0, 0.15, 0)),
  };
  meshes.push(...Object.values(tips), ...hood, ...hat);
  return { root, body, crystal, meshes, robe, trim, glow, wood, hat, hood, tips };
}

export function applyLook(w: Wizard, look: Look) {
  const robe = Color3.FromHexString(look.robe);
  w.robe.diffuseColor = robe;
  w.trim.diffuseColor = robe.scale(0.6);
  const crystal = Color3.FromHexString(look.crystal);
  w.glow.diffuseColor = crystal;
  w.glow.emissiveColor = crystal.scale(0.8);
  w.hat.forEach((m) => (m.isVisible = look.hat === "hat"));
  w.hood.forEach((m) => (m.isVisible = look.hat === "hood"));
  w.wood.diffuseColor = STAFF_COLORS[look.staff];
  for (const [kind, tip] of Object.entries(w.tips)) tip.isVisible = kind === look.staff;
}

export interface Dragon {
  spec: DragonSpec;
  root: TransformNode;
  body: DragonBody; // the model: its clips, its head and its saddle
  head: TransformNode;
  meshes: Mesh[];
  skin: StandardMaterial;
  heart: Mesh; // floats over a friend, so a friend waiting at home never looks wild
  fullSize: number; // the root's scaling at full size; friends following him shrink below it
  grump: number; // 100 is grumpy, 0 is a friend
  friend: boolean;
  calmUntil: number; // no face-off before this time, so walking away works
  flinch: number;
  pitch: number; // the head tipped up for a roar, on top of the clip
  phase: number;
}

export function makeDragon(scene: Scene, spec: DragonSpec): Dragon {
  const root = new TransformNode(spec.id, scene);
  root.position.set(spec.home[0], 0, spec.home[1]);
  const fullSize = 1.3 * (spec.size ?? 1);
  root.scaling.setAll(fullSize);
  const color = Color3.FromHexString(spec.color);
  const body = makeDragonBody(scene, spec.id, root, {
    body: color,
    belly: Color3.FromHexString(spec.belly),
    wings: spec.wings ? Color3.FromHexString(spec.wings) : color.scale(0.75),
  });
  if (spec.lava) recolorOf(body.skin).lava = Color3.FromHexString(spec.belly);
  const meshes: Mesh[] = [body.mesh];

  // The heart and crown ride on the skull, placed where they'd sit with the dragon at rest.
  const top = body.mount(new Vector3(0, body.headTop, body.headZ));
  if (spec.crown) {
    const gold = material(scene, new Color3(1, 0.8, 0.25), new Color3(0.35, 0.25, 0.05));
    meshes.push(part(MeshBuilder.CreateTorus("band", { diameter: 0.7, thickness: 0.1, tessellation: 24 }, scene), top, gold, new Vector3(0, -0.1, 0)));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      meshes.push(part(MeshBuilder.CreateCylinder("point", { height: 0.32, diameterTop: 0, diameterBottom: 0.14, tessellation: 6 }, scene), top, gold, new Vector3(Math.sin(a) * 0.33, 0.06, Math.cos(a) * 0.33)));
    }
  }

  const heart = MeshBuilder.CreatePlane("heart", { size: 0.9 }, scene);
  const heartTexture = new DynamicTexture("heart", { width: 128, height: 128 }, scene, false);
  heartTexture.hasAlpha = true;
  const ctx = heartTexture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.font = "100px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("💛", 64, 72);
  heartTexture.update();
  const heartMat = new StandardMaterial("heartMat", scene);
  heartMat.diffuseTexture = heartTexture;
  heartMat.emissiveColor = Color3.White();
  heartMat.disableLighting = true;
  heart.material = heartMat;
  heart.parent = top;
  heart.position.y = 0.9 + (spec.crown ? 0.4 : 0);
  heart.billboardMode = Mesh.BILLBOARDMODE_ALL;
  heart.isPickable = false;
  heart.isVisible = false;

  return {
    spec, root, body, head: body.head, meshes, skin: body.skin, heart, fullSize,
    grump: 100,
    friend: false,
    calmUntil: 0,
    flinch: 0,
    pitch: 0,
    phase: Math.random() * 6,
  };
}

// Its own parts go with the model; the heart and crown go with the root.
export function disposeDragon(d: Dragon) {
  for (const m of [...d.meshes.slice(1), d.heart]) m.dispose(false, true);
  d.body.dispose();
  d.root.dispose(false, true);
}
