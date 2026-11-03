import {
  AbstractMesh,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "./babylon";
import { AREAS, type AreaId, type AreaSpec } from "./areas";

export const WORLD_RADIUS = 52;

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface Tree extends Obstacle {
  crown: number; // crown radius, for hiding it from the camera
  height: number;
  meshes: AbstractMesh[];
  fade: number; // 1 is solid
  setFade(alpha: number): void;
}

export interface Portal {
  to: AreaId;
  needs: number;
  x: number;
  z: number;
  disc: Mesh;
  setFriends(count: number): void;
}

export interface Star {
  id: string;
  mesh: Mesh;
  baseY: number;
  collected: boolean;
}

export interface Area {
  spec: AreaSpec;
  ground: Mesh;
  trees: Tree[];
  obstacles: Obstacle[];
  portals: Portal[];
  stars: Star[];
  dispose(): void;
}

const hex = (h: string) => Color3.FromHexString(h);

function material(scene: Scene, color: Color3, glows = false): StandardMaterial {
  const m = new StandardMaterial("m", scene);
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  if (glows) m.emissiveColor = color;
  return m;
}

// Seeded so each area looks the same every time he visits.
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function setupLights(scene: Scene): ShadowGenerator {
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
  return shadows;
}

// A sign over a locked portal: one dragon per friend it needs, lit for each friend he has.
function drawSign(texture: DynamicTexture, needs: number, friends: number) {
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 120, 28);
  ctx.fill();
  ctx.font = "72px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("🔒", 20, 68);
  for (let i = 0; i < needs; i++) {
    ctx.globalAlpha = i < friends ? 1 : 0.25;
    ctx.fillText("🐉", 120 + i * 92, 68);
  }
  ctx.globalAlpha = 1;
  texture.update();
}

// Instances share their source's visibility, so a fading tree swaps its instances for copies of its own.
function fader(meshes: AbstractMesh[], root: TransformNode): (alpha: number) => void {
  let ghosts: AbstractMesh[] | null = null;
  return (alpha) => {
    const solid = alpha >= 0.99;
    ghosts ??= meshes.map((m) => {
      if (!(m instanceof InstancedMesh)) return m;
      const g = m.sourceMesh.clone("ghost", root, true);
      g.position.copyFrom(m.position);
      g.scaling.copyFrom(m.scaling);
      g.rotation.copyFrom(m.rotation);
      g.isPickable = false;
      return g;
    });
    meshes.forEach((m, i) => {
      if (ghosts![i] === m) {
        m.visibility = alpha;
        return;
      }
      m.isVisible = solid;
      ghosts![i].isVisible = !solid;
      ghosts![i].visibility = alpha;
    });
  };
}

export function buildArea(scene: Scene, spec: AreaSpec, shadows: ShadowGenerator, keepClear: Vector3[], collected: string[]): Area {
  const root = new TransformNode(spec.id, scene);
  const sky = hex(spec.sky);
  scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 45;
  scene.fogEnd = 95;
  scene.fogColor = sky;

  const owned: Mesh[] = [];
  const own = <T extends AbstractMesh>(m: T): T => {
    m.parent = root;
    m.isPickable = false;
    return m;
  };

  const ground = MeshBuilder.CreateGround("ground", { width: 140, height: 140 }, scene);
  ground.material = material(scene, hex(spec.ground));
  ground.receiveShadows = true;
  ground.parent = root;
  owned.push(ground);

  const rand = random(spec.id.length * 97 + spec.trees);
  const portalSpots = spec.portals.map((p) => new Vector3(p.at[0], 0, p.at[1]));
  const spawn = new Vector3(spec.spawn[0], 0, spec.spawn[1]);
  const clearOf = [spawn, ...keepClear, ...portalSpots];
  const clear = (x: number, z: number, r: number) => clearOf.every((p) => Math.hypot(x - p.x, z - p.z) > r);

  const obstacles: Obstacle[] = [];
  const trees: Tree[] = [];

  // Every tree is an instance, with the source meshes hidden, so each one can be hidden on its own.
  const trunk = own(MeshBuilder.CreateCylinder("trunk", { height: 2.4, diameterTop: 0.35, diameterBottom: 0.55, tessellation: 8 }, scene));
  trunk.material = material(scene, hex(spec.trunk));
  const crown = own(
    MeshBuilder.CreateCylinder("crown", spec.dead ? { height: 3, diameterTop: 0, diameterBottom: 1.1, tessellation: 6 } : { height: 4.5, diameterTop: 0, diameterBottom: 3.2, tessellation: 10 }, scene),
  );
  crown.material = material(scene, hex(spec.crown));
  const cap = spec.cap ? own(MeshBuilder.CreateCylinder("cap", { height: 1.7, diameterTop: 0, diameterBottom: 1.5, tessellation: 10 }, scene)) : null;
  if (cap) cap.material = material(scene, hex(spec.cap!));
  for (const m of [trunk, crown, cap]) if (m) m.isVisible = false;

  let placed = 0;
  while (placed < spec.trees) {
    const x = (rand() - 0.5) * 120;
    const z = (rand() - 0.5) * 120;
    if (!clear(x, z, 10)) continue;
    const s = 0.8 + rand() * 0.8;
    const meshes: AbstractMesh[] = [];
    const t = own(trunk.createInstance("t"));
    t.position.set(x, 1.2 * s, z);
    t.scaling.setAll(s);
    meshes.push(t);
    const c = own(crown.createInstance("c"));
    c.position.set(x, (spec.dead ? 3.6 : 4.4) * s, z);
    c.scaling.setAll(s);
    meshes.push(c);
    if (cap) {
      const k = own(cap.createInstance("k"));
      k.position.set(x, 5.9 * s, z);
      k.scaling.setAll(s);
      meshes.push(k);
    }
    meshes.forEach((m) => shadows.addShadowCaster(m));
    const tree = { x, z, radius: 0.7 * s, crown: (spec.dead ? 0.6 : 1.6) * s, height: (spec.dead ? 5.1 : 6.6) * s, meshes, fade: 1, setFade: fader(meshes, root) };
    trees.push(tree);
    obstacles.push(tree);
    placed++;
  }

  const rock = own(MeshBuilder.CreateSphere("rock", { diameter: 1.4, segments: 6 }, scene));
  rock.material = material(scene, hex(spec.rock));
  rock.isVisible = false;
  for (let i = 0; i < 30; i++) {
    const x = (rand() - 0.5) * 100;
    const z = (rand() - 0.5) * 100;
    if (!clear(x, z, 6)) continue;
    const r = own(rock.createInstance("r"));
    r.position.set(x, 0.2, z);
    r.scaling.set(0.6 + rand(), 0.4 + rand() * 0.5, 0.6 + rand());
  }

  const sprinkle = own(MeshBuilder.CreateSphere("sprinkle", { diameter: 0.25, segments: 4 }, scene));
  sprinkle.material = material(scene, hex(spec.sprinkle), spec.sprinkleGlows);
  sprinkle.isVisible = false;
  for (let i = 0; i < 120; i++) {
    const f = own(sprinkle.createInstance("f"));
    f.position.set((rand() - 0.5) * 90, 0.12, (rand() - 0.5) * 90);
  }

  if (spec.lava) {
    const lavaMat = material(scene, new Color3(1, 0.35, 0.1), true);
    let pools = 0;
    while (pools < 9) {
      const x = (rand() - 0.5) * 90;
      const z = (rand() - 0.5) * 90;
      const radius = 2 + rand() * 2;
      if (!clear(x, z, 9 + radius)) continue;
      const pool = own(MeshBuilder.CreateDisc("lava", { radius, tessellation: 24 }, scene));
      pool.material = lavaMat;
      pool.rotation.x = Math.PI / 2;
      pool.position.set(x, 0.04, z);
      obstacles.push({ x, z, radius });
      pools++;
    }
  }

  const stoneMat = material(scene, new Color3(0.55, 0.53, 0.5));
  const portals: Portal[] = spec.portals.map((p) => {
    const [x, z] = p.at;
    const node = new TransformNode("portal", scene);
    node.parent = root;
    node.position.set(x, 0, z);
    node.rotation.y = Math.atan2(-x, -z);
    const parts: AbstractMesh[] = [];
    const ring = own(MeshBuilder.CreateTorus("ring", { diameter: 5, thickness: 0.6, tessellation: 32 }, scene));
    ring.parent = node;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.8;
    ring.material = stoneMat;
    parts.push(ring);
    for (const side of [-1, 1]) {
      const pillar = own(MeshBuilder.CreateCylinder("pillar", { height: 2.8, diameter: 0.7 }, scene));
      pillar.parent = node;
      pillar.position.set(side * 2.5, 1.4, 0);
      pillar.material = stoneMat;
      parts.push(pillar);
      // Pillars in world space, so he walks between them, not through them.
      obstacles.push({ x: x + Math.cos(node.rotation.y) * side * 2.5, z: z - Math.sin(node.rotation.y) * side * 2.5, radius: 0.45 });
    }
    const swirl = material(scene, hex(AREAS[p.to].portalColor), true);
    swirl.backFaceCulling = false;
    swirl.alpha = 0.75;
    const disc = own(MeshBuilder.CreateDisc("swirl", { radius: 2.2, tessellation: 32 }, scene));
    disc.parent = node;
    disc.position.y = 2.8;
    disc.material = swirl;
    parts.push(disc);
    // Listed with the trees so it hides when it stands between the camera and the wizard.
    trees.push({ x, z, radius: 0, crown: 2.8, height: 5.6, meshes: parts, fade: 1, setFade: fader(parts, root) });

    const signTexture = new DynamicTexture("sign", { width: 512, height: 128 }, scene, false);
    signTexture.hasAlpha = true;
    const signMat = new StandardMaterial("signMat", scene);
    signMat.diffuseTexture = signTexture;
    signMat.emissiveColor = Color3.White();
    signMat.disableLighting = true;
    signMat.backFaceCulling = false;
    const sign = own(MeshBuilder.CreatePlane("sign", { width: 4, height: 1 }, scene));
    sign.parent = node;
    sign.position.y = 6;
    sign.material = signMat;
    sign.billboardMode = Mesh.BILLBOARDMODE_Y;

    return {
      to: p.to,
      needs: p.needs,
      x,
      z,
      disc,
      setFriends(count: number) {
        const open = count >= p.needs;
        swirl.emissiveColor = open ? hex(AREAS[p.to].portalColor) : new Color3(0.15, 0.15, 0.18);
        swirl.diffuseColor = swirl.emissiveColor;
        sign.isVisible = !open;
        if (!open) drawSign(signTexture, p.needs, count);
      },
    };
  });

  const starMat = material(scene, new Color3(1, 0.85, 0.25), true);
  const stars: Star[] = [];
  spec.stars.forEach(([x, y, z], i) => {
    const id = `${spec.id}-${i}`;
    if (collected.includes(id)) return;
    const mesh = own(MeshBuilder.CreatePolyhedron("star", { type: 1, size: 0.6 }, scene));
    mesh.material = starMat;
    mesh.position.set(x, y, z);
    stars.push({ id, mesh, baseY: y, collected: false });
  });

  return {
    spec,
    ground,
    trees,
    obstacles,
    portals,
    stars,
    dispose: () => root.dispose(false, true),
  };
}
