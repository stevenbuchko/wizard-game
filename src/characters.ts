import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from "./babylon";
import type { DragonSpec, Element } from "./dragons";
import type { Look } from "./save";

// Placeholder characters built from primitives, to be swapped for rigged 3D models.

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
  head: TransformNode;
  wings: TransformNode[]; // left, right
  meshes: Mesh[];
  skin: StandardMaterial;
  heart: Mesh; // floats over a friend, so a friend waiting at home never looks wild
  fullSize: number; // the root's scaling at full size; friends following him shrink below it
  headBaseY: number;
  grump: number; // 100 is grumpy, 0 is a friend
  friend: boolean;
  calmUntil: number; // no face-off before this time, so walking away works
  flinch: number;
  phase: number;
}

export function makeDragon(scene: Scene, spec: DragonSpec): Dragon {
  const color = Color3.FromHexString(spec.color);
  const root = new TransformNode(spec.id, scene);
  root.position.set(spec.home[0], 0, spec.home[1]);
  const fullSize = 1.3 * (spec.size ?? 1);
  root.scaling.setAll(fullSize);
  const skin = material(scene, color);
  const belly = material(scene, Color3.FromHexString(spec.belly));
  const wingMat = material(scene, spec.wings ? Color3.FromHexString(spec.wings) : color.scale(0.75));
  wingMat.backFaceCulling = false;
  const horn = material(scene, new Color3(0.9, 0.82, 0.6));
  const eye = material(scene, new Color3(1, 0.8, 0.2), new Color3(0.6, 0.45, 0.05));
  const hornLength = spec.horns ?? 0.7;
  const meshes: Mesh[] = [];
  const add = (m: Mesh, mat: StandardMaterial, pos: Vector3, parent: TransformNode = root) => {
    meshes.push(part(m, parent, mat, pos));
    return m;
  };

  add(MeshBuilder.CreateSphere("body", { diameterX: 2.0, diameterY: 1.6, diameterZ: 3.0 }, scene), skin, new Vector3(0, 1.7, 0));
  add(MeshBuilder.CreateSphere("belly", { diameterX: 1.5, diameterY: 1.2, diameterZ: 2.4 }, scene), belly, new Vector3(0, 1.45, 0.25));
  for (const x of [-0.7, 0.7]) {
    for (const z of [-0.9, 0.9]) {
      add(MeshBuilder.CreateCylinder("leg", { height: 1.3, diameterTop: 0.45, diameterBottom: 0.35 }, scene), skin, new Vector3(x, 0.65, z));
    }
  }
  for (let i = 0; i < 5; i++) {
    add(MeshBuilder.CreateSphere("tail", { diameter: 0.8 - i * 0.14 }, scene), skin, new Vector3(0, 1.5 - i * 0.22, -1.5 - i * 0.6));
  }
  for (const z of [-0.9, -0.3, 0.3, 0.9]) {
    add(MeshBuilder.CreateCylinder("spine", { height: 0.4, diameterTop: 0, diameterBottom: 0.25 }, scene), horn, new Vector3(0, 2.5, z));
  }
  const neck = add(MeshBuilder.CreateCylinder("neck", { height: 1.7, diameterTop: 0.55, diameterBottom: 0.9 }, scene), skin, new Vector3(0, 2.6, 1.25));
  neck.rotation.x = 0.6;

  const head = new TransformNode("head", scene);
  head.parent = root;
  head.position = new Vector3(0, 3.4, 1.95);
  add(MeshBuilder.CreateSphere("skull", { diameterX: 0.95, diameterY: 0.8, diameterZ: 1.2 }, scene), skin, Vector3.Zero(), head);
  add(MeshBuilder.CreateSphere("snout", { diameterX: 0.7, diameterY: 0.5, diameterZ: 0.8 }, scene), skin, new Vector3(0, -0.15, 0.6), head);
  for (const x of [-0.3, 0.3]) {
    add(MeshBuilder.CreateSphere("eye", { diameter: 0.2 }, scene), eye, new Vector3(x, 0.15, 0.35), head);
    const h = add(MeshBuilder.CreateCylinder("horn", { height: hornLength, diameterTop: 0, diameterBottom: 0.2 }, scene), horn, new Vector3(x * 0.8, 0.1 + hornLength / 2, -0.3), head);
    h.rotation.x = -0.7;
  }
  if (spec.crown) {
    const gold = material(scene, new Color3(1, 0.8, 0.25), new Color3(0.35, 0.25, 0.05));
    add(MeshBuilder.CreateTorus("band", { diameter: 0.7, thickness: 0.1, tessellation: 24 }, scene), gold, new Vector3(0, 0.42, -0.05), head);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(MeshBuilder.CreateCylinder("point", { height: 0.32, diameterTop: 0, diameterBottom: 0.14, tessellation: 6 }, scene), gold, new Vector3(Math.sin(a) * 0.33, 0.58, Math.cos(a) * 0.33 - 0.05), head);
    }
  }

  const wings = [-1, 1].map((side) => {
    const pivot = new TransformNode("wing", scene);
    pivot.parent = root;
    pivot.position = new Vector3(side * 0.8, 2.3, 0.2);
    const wing = add(MeshBuilder.CreateDisc("membrane", { radius: 2.2, tessellation: 3 }, scene), wingMat, new Vector3(side * 1.4, 0, 0), pivot);
    wing.rotation.x = Math.PI / 2;
    wing.scaling.set(side, 0.9, 1);
    return pivot;
  });

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
  heart.parent = head;
  heart.position.y = 1.3 + (spec.crown ? 0.4 : 0);
  heart.billboardMode = Mesh.BILLBOARDMODE_ALL;
  heart.isPickable = false;
  heart.isVisible = false;

  return {
    spec, root, head, wings, meshes, skin, heart, fullSize,
    headBaseY: head.position.y,
    grump: 100,
    friend: false,
    calmUntil: 0,
    flinch: 0,
    phase: Math.random() * 6,
  };
}
