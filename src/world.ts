import {
  AbstractMesh,
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

export const WORLD_RADIUS = 52;

function material(scene: Scene, color: Color3): StandardMaterial {
  const m = new StandardMaterial("m", scene);
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  return m;
}

// Seeded so the forest is the same every time he plays.
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Tree {
  x: number;
  z: number;
  radius: number; // trunk plus a margin, for walking into
  crown: number; // crown radius, for hiding it from the camera
  height: number;
  meshes: AbstractMesh[];
}

export function makeWorld(scene: Scene, keepClear: Vector3[]): { ground: Mesh; shadows: ShadowGenerator; trees: Tree[] } {
  const sky = new Color3(0.62, 0.8, 0.95);
  scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 45;
  scene.fogEnd = 95;
  scene.fogColor = sky;

  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.7;
  ambient.groundColor = new Color3(0.35, 0.4, 0.3);
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene);
  sun.position = new Vector3(30, 60, -30);
  sun.intensity = 0.9;
  sun.diffuse = new Color3(1, 0.94, 0.82);

  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 16;

  const ground = MeshBuilder.CreateGround("ground", { width: 140, height: 140 }, scene);
  ground.material = material(scene, new Color3(0.36, 0.6, 0.25));
  ground.receiveShadows = true;

  const rand = random(7);
  const clear = (x: number, z: number, r: number) =>
    Math.hypot(x, z) > r && keepClear.every((p) => Math.hypot(x - p.x, z - p.z) > r);

  const trunk = MeshBuilder.CreateCylinder("trunk", { height: 2.4, diameterTop: 0.35, diameterBottom: 0.55, tessellation: 8 }, scene);
  trunk.material = material(scene, new Color3(0.4, 0.26, 0.14));
  const crown = MeshBuilder.CreateCylinder("crown", { height: 4.5, diameterTop: 0, diameterBottom: 3.2, tessellation: 10 }, scene);
  crown.material = material(scene, new Color3(0.13, 0.36, 0.2));
  const rock = MeshBuilder.CreateSphere("rock", { diameter: 1.4, segments: 6 }, scene);
  rock.material = material(scene, new Color3(0.55, 0.55, 0.52));
  const flower = MeshBuilder.CreateSphere("flower", { diameter: 0.25, segments: 4 }, scene);
  flower.material = material(scene, new Color3(1, 0.85, 0.3));

  const trees: Tree[] = [];
  // Every tree is an instance, with the source meshes hidden, so each one can be hidden on its own.
  trunk.isVisible = false;
  crown.isVisible = false;
  let placed = 0;
  while (placed < 150) {
    const x = (rand() - 0.5) * 120;
    const z = (rand() - 0.5) * 120;
    if (!clear(x, z, 10)) continue;
    const s = 0.8 + rand() * 0.8;
    const t = trunk.createInstance("t");
    const c = crown.createInstance("c");
    t.position.set(x, 1.2 * s, z);
    t.scaling.setAll(s);
    c.position.set(x, (2.4 + 2.0) * s, z);
    c.scaling.setAll(s);
    shadows.addShadowCaster(t);
    shadows.addShadowCaster(c);
    trees.push({ x, z, radius: 0.7 * s, crown: 1.6 * s, height: 6.6 * s, meshes: [t, c] });
    placed++;
  }
  for (let i = 0; i < 30; i++) {
    const x = (rand() - 0.5) * 100;
    const z = (rand() - 0.5) * 100;
    if (!clear(x, z, 6)) continue;
    const r = i === 0 ? rock : rock.createInstance("r");
    r.position.set(x, 0.2, z);
    r.scaling.set(0.6 + rand(), 0.4 + rand() * 0.5, 0.6 + rand());
  }
  for (let i = 0; i < 120; i++) {
    const f = i === 0 ? flower : flower.createInstance("f");
    f.position.set((rand() - 0.5) * 90, 0.12, (rand() - 0.5) * 90);
  }

  for (const m of scene.meshes) m.isPickable = m === ground;
  return { ground, shadows, trees };
}
