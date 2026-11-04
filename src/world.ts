import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  ColorCurves,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  ImageProcessingConfiguration,
  InstancedMesh,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  ShaderMaterial,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "./babylon";
import { AREAS, type AreaId, type AreaSpec, type Grade } from "./areas";
import { drawTally, TALLY_H, TALLY_W } from "./tally";

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
  setFriends(friends: string[]): void;
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

const SUN = new Vector3(-0.5, -1, 0.4); // the light's direction

export function setupLights(scene: Scene): ShadowGenerator {
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.7;
  ambient.groundColor = new Color3(0.35, 0.4, 0.3);
  const sun = new DirectionalLight("sun", SUN.clone(), scene);
  sun.position = new Vector3(30, 60, -30);
  sun.intensity = 0.9;
  sun.diffuse = new Color3(1, 0.94, 0.82);
  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 16;
  return shadows;
}

// The film finish: tone mapping, bloom on whatever is brightest, smooth edges and a light vignette, graded per area.
export function setupFilm(scene: Scene, camera: ArcRotateCamera): (grade: Grade) => void {
  const film = new DefaultRenderingPipeline("film", true, scene, [camera]);
  film.samples = 4;
  film.bloomEnabled = true;
  film.bloomKernel = 64;
  film.bloomScale = 0.5;
  film.bloomWeight = 0.35;
  const look = scene.imageProcessingConfiguration;
  look.toneMappingEnabled = true;
  look.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  look.vignetteEnabled = true;
  look.vignetteWeight = 1.2;
  look.vignetteStretch = 0.6;
  look.vignetteColor = new Color4(0, 0, 0, 0);
  look.colorCurvesEnabled = true;
  const curves = new ColorCurves();
  look.colorCurves = curves;
  return (grade) => {
    look.exposure = grade.exposure;
    look.contrast = grade.contrast;
    curves.globalSaturation = grade.saturation;
    [curves.highlightsHue, curves.highlightsDensity] = grade.highlights;
    [curves.shadowsHue, curves.shadowsDensity] = grade.shadows;
    film.bloomThreshold = grade.bloom;
  };
}

const SKY_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// Mountains are drawn in the sky itself: whole numbers of ridges around the circle, so the range meets itself behind him.
const SKY_FRAGMENT = `
precision highp float;
varying vec3 vDir;
uniform vec3 top, horizon, sunColor, far, near, peak;
uniform vec3 sunDir;
uniform float height, seed, peaks;
float ridge(float x) { return 1.0 - abs(sin(x)); }
float range(float a, float s) {
  return 0.4 * ridge(a * 2.0 + s) + 0.3 * ridge(a * 5.0 + s * 2.3) + 0.2 * ridge(a * 11.0 + s * 3.1) + 0.1 * ridge(a * 23.0 + s * 4.7);
}
vec3 mountain(vec3 sky, vec3 color, float h, float top, float hazeTop) {
  if (h > top) return sky;
  vec3 c = mix(horizon, color, smoothstep(-0.01, hazeTop, h));
  if (peaks > 0.5 && h > top - 0.022) c = mix(c, peak, 0.85);
  return c;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float s = max(dot(d, sunDir), 0.0);
  vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.35));
  c += sunColor * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.4 + smoothstep(0.9993, 0.9996, s) * 2.5);
  float a = atan(d.z, d.x);
  c = mountain(c, far, h, height * range(a, seed), height * 0.5);
  c = mountain(c, near, h, height * 0.7 * range(a, seed + 1.9) - 0.01, height * 0.25);
  if (h < 0.0) c = horizon;
  gl_FragColor = vec4(c, 1.0);
}`;

function buildSky(scene: Scene, spec: AreaSpec, root: TransformNode) {
  const sky = new ShaderMaterial("sky", scene, { vertexSource: SKY_VERTEX, fragmentSource: SKY_FRAGMENT }, {
    attributes: ["position"],
    uniforms: ["worldViewProjection", "top", "horizon", "sunColor", "far", "near", "peak", "sunDir", "height", "seed", "peaks"],
  });
  sky.backFaceCulling = false;
  // Lower than the light itself, so he sees the sun glow above the mountains when he turns toward it.
  const sun = new Vector3(-SUN.x, 0, -SUN.z).normalize().scale(Math.cos(0.32));
  sun.y = Math.sin(0.32);
  sky.setColor3("top", hex(spec.skyTop));
  sky.setColor3("horizon", hex(spec.sky));
  sky.setColor3("sunColor", hex(spec.sun));
  sky.setColor3("far", hex(spec.mountains[0]));
  sky.setColor3("near", hex(spec.mountains[1]));
  sky.setColor3("peak", hex(spec.peaks ?? spec.sky));
  sky.setFloat("peaks", spec.peaks ? 1 : 0);
  sky.setVector3("sunDir", sun);
  sky.setFloat("height", spec.id === "summit" ? 0.07 : 0.12);
  sky.setFloat("seed", [...spec.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 7);
  const dome = MeshBuilder.CreateSphere("sky", { diameter: 800, segments: 24 }, scene);
  dome.material = sky;
  dome.isPickable = false;
  dome.parent = root;
}

const rgba = (c: Color3, a: number) => `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;

// A soft blob drawn again across each edge it crosses, so the tile repeats without a seam.
function blob(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, r: number, color: Color3, a: number) {
  for (const dx of [-size, 0, size])
    for (const dy of [-size, 0, size]) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx + r < 0 || cx - r > size || cy + r < 0 || cy - r > size) continue;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba(color, a));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
}

// Cracked plates or crystal facets: for each pixel, how far it is from the nearest edge between cells, and which cell it is in.
function cells(size: number, n: number, rand: () => number): (x: number, y: number) => { edge: number; id: number; dx: number; dy: number } {
  const step = size / n;
  const points = Array.from({ length: n * n }, (_, i) => [((i % n) + 0.15 + rand() * 0.7) * step, (Math.floor(i / n) + 0.15 + rand() * 0.7) * step]);
  return (x, y) => {
    const gx = Math.floor(x / step);
    const gy = Math.floor(y / step);
    let f1 = Infinity;
    let f2 = Infinity;
    let id = 0;
    let dx = 0;
    let dy = 0;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const cx = gx + ox;
        const cy = gy + oy;
        const i = (((cy % n) + n) % n) * n + (((cx % n) + n) % n);
        const px = points[i][0] + (cx - (((cx % n) + n) % n)) * step;
        const py = points[i][1] + (cy - (((cy % n) + n) % n)) * step;
        const d = Math.hypot(x - px, y - py);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = i;
          dx = (x - px) / step;
          dy = (y - py) / step;
        } else if (d < f2) f2 = d;
      }
    return { edge: (f2 - f1) / 2, id, dx, dy };
  };
}

const FLOOR_TILE = 18; // metres of ground one tile of the floor texture covers

// The floor texture for each kind of ground, and what glows in it: sparkles on snow, seams in ash, glints in crystal.
function paintFloor(scene: Scene, spec: AreaSpec, rand: () => number): { color: DynamicTexture; glow?: DynamicTexture } {
  const size = 512;
  const texture = () => {
    const t = new DynamicTexture("floor", { width: size, height: size }, scene, true);
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 8;
    return t;
  };
  const color = texture();
  const ctx = color.getContext() as unknown as CanvasRenderingContext2D;
  const base = hex(spec.ground);
  ctx.fillStyle = spec.ground;
  ctx.fillRect(0, 0, size, size);
  let glow: DynamicTexture | undefined;

  if (spec.floor === "grass" || spec.floor === "snow") {
    const light = spec.floor === "grass" ? base.scale(1.2) : Color3.White();
    const dark = spec.floor === "grass" ? base.scale(0.75) : new Color3(0.78, 0.84, 0.92);
    for (let i = 0; i < 70; i++) blob(ctx, size, rand() * size, rand() * size, 20 + rand() * 70, rand() < 0.5 ? light : dark, 0.3);
    if (spec.floor === "grass") {
      const dirt = hex("#8a6a45");
      for (let p = 0; p < 3; p++) {
        const px = rand() * size;
        const py = rand() * size;
        for (let i = 0; i < 9; i++) blob(ctx, size, px + (rand() - 0.5) * 70, py + (rand() - 0.5) * 70, 12 + rand() * 26, dirt, 0.55);
      }
      // Short blades, each wrapped across the edge, so the grass reads up close.
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 7000; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const len = 3 + rand() * 5;
        const lean = (rand() - 0.5) * 3;
        ctx.strokeStyle = rgba(rand() < 0.5 ? base.scale(1.25 + rand() * 0.2) : base.scale(0.6 + rand() * 0.2), 0.7);
        for (const dx of [0, x < 8 ? size : x > size - 8 ? -size : 0])
          for (const dy of [0, y < 8 ? size : y > size - 8 ? -size : 0]) {
            ctx.beginPath();
            ctx.moveTo(x + dx, y + dy);
            ctx.lineTo(x + dx + lean, y + dy - len);
            ctx.stroke();
          }
      }
    } else {
      // Wind ripples in the snow.
      ctx.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const y = rand() * size;
        ctx.strokeStyle = rgba(dark, 0.18);
        ctx.beginPath();
        for (let x = -10; x <= size + 10; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + i) * 8);
        ctx.stroke();
      }
      glow = texture();
      const g = glow.getContext() as unknown as CanvasRenderingContext2D;
      g.fillStyle = "#000";
      g.fillRect(0, 0, size, size);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = rand() < 0.7 ? "#ffffff" : "#bfe6ff";
        g.fillRect(rand() * size, rand() * size, 1 + rand() * 1.5, 1 + rand() * 1.5);
      }
    }
  } else {
    // Ash and crystal are per-pixel cells: plates of ash split by glowing seams, or faceted crystal stone.
    const ash = spec.floor === "ash";
    const cell = cells(size, ash ? 10 : 6, rand);
    const shade = Array.from({ length: 64 }, () => 0.8 + rand() * 0.35);
    const lit = Array.from({ length: 64 }, () => rand());
    const pixels = ctx.getImageData(0, 0, size, size);
    glow = texture();
    const g = glow.getContext() as unknown as CanvasRenderingContext2D;
    const glowPixels = g.getImageData(0, 0, size, size);
    const seam = hex(spec.sprinkle);
    const facetEdge = hex(spec.crown);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const { edge, id, dx, dy } = cell(x, y);
        const i = (y * size + x) * 4;
        let k = shade[id];
        let r = base.r * k;
        let gr = base.g * k;
        let b = base.b * k;
        let glowR = 0;
        let glowG = 0;
        let glowB = 0;
        if (ash) {
          const speck = ((x * 7919 + y * 104729) % 97) / 97;
          const lip = Math.min(1, edge / 4);
          const dim = (0.65 + 0.35 * lip) * (0.92 + speck * 0.16);
          r *= dim;
          gr *= dim;
          b *= dim;
          const heat = Math.max(0, 1 - edge / 2.2) * (0.35 + 0.65 * lit[id]);
          r = r * (1 - heat) + seam.r * heat;
          gr = gr * (1 - heat) + seam.g * heat * 0.8;
          b = b * (1 - heat) + seam.b * heat * 0.6;
          glowR = seam.r * heat;
          glowG = seam.g * heat * 0.7;
          glowB = seam.b * heat * 0.4;
        } else {
          // Each facet tilts a different way, so the light catches some and not others.
          k = 1 + (dx * Math.cos(id) + dy * Math.sin(id)) * 0.35;
          r *= k;
          gr *= k;
          b *= k;
          const rim = Math.max(0, 1 - edge / 1.6);
          r = r * (1 - rim) + facetEdge.r * rim;
          gr = gr * (1 - rim) + facetEdge.g * rim;
          b = b * (1 - rim) + facetEdge.b * rim;
          const glint = lit[id] > 0.85 ? Math.max(0, 1 - Math.hypot(dx, dy) * 12) : 0;
          glowR = facetEdge.r * rim * 0.25 + glint;
          glowG = facetEdge.g * rim * 0.25 + glint;
          glowB = facetEdge.b * rim * 0.25 + glint;
        }
        pixels.data[i] = Math.min(255, r * 255);
        pixels.data[i + 1] = Math.min(255, gr * 255);
        pixels.data[i + 2] = Math.min(255, b * 255);
        glowPixels.data[i] = Math.min(255, glowR * 255);
        glowPixels.data[i + 1] = Math.min(255, glowG * 255);
        glowPixels.data[i + 2] = Math.min(255, glowB * 255);
        glowPixels.data[i + 3] = 255;
      }
    ctx.putImageData(pixels, 0, 0);
    g.putImageData(glowPixels, 0, 0);
  }
  color.update();
  glow?.update();
  return { color, glow };
}

// Big soft light and dark patches across the whole ground, so the repeating floor tile doesn't show.
function paintPatches(scene: Scene, rand: () => number): DynamicTexture {
  const size = 256;
  const t = new DynamicTexture("patches", { width: size, height: size }, scene, true);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) blob(ctx, size, rand() * size, rand() * size, 15 + rand() * 45, rand() < 0.5 ? Color3.White() : new Color3(0.72, 0.72, 0.72), 0.5);
  t.update();
  return t;
}

// Grass tufts, frosted grass, charred stalks or crystal shards: one mesh drawn many times in a single call.
function scatterTufts(scene: Scene, spec: AreaSpec, root: TransformNode, rand: () => number, free: (x: number, z: number) => boolean) {
  const parts: Mesh[] = [];
  const pivots: TransformNode[] = [];
  const blades = { grass: 7, snow: 5, ash: 3, crystal: 3 }[spec.floor];
  for (let i = 0; i < blades; i++) {
    const crystal = spec.floor === "crystal";
    const height = crystal ? 0.35 + rand() * 0.45 : 0.3 + rand() * 0.35;
    const pivot = new TransformNode("pivot", scene);
    pivot.rotation.set((rand() - 0.5) * (crystal ? 1 : 0.9), rand() * Math.PI * 2, (rand() - 0.5) * 0.9);
    const blade = MeshBuilder.CreateCylinder("blade", { height, diameterTop: 0, diameterBottom: crystal ? 0.16 : 0.07, tessellation: crystal ? 6 : 3 }, scene);
    blade.parent = pivot;
    blade.position.set((rand() - 0.5) * 0.2, height / 2, (rand() - 0.5) * 0.2);
    pivots.push(pivot);
    parts.push(blade);
  }
  const tuft = Mesh.MergeMeshes(parts, true)!;
  pivots.forEach((p) => p.dispose());
  tuft.parent = root;
  tuft.isPickable = false;
  tuft.receiveShadows = true;
  tuft.material = material(scene, hex(spec.tuft), spec.floor === "crystal");
  if (spec.floor === "crystal") (tuft.material as StandardMaterial).emissiveColor = hex(spec.tuft).scale(0.12);

  const count = spec.floor === "grass" ? 900 : spec.floor === "snow" ? 300 : 500;
  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 4);
  const matrix = new Matrix();
  let placed = 0;
  while (placed < count) {
    const x = (rand() - 0.5) * 110;
    const z = (rand() - 0.5) * 110;
    if (!free(x, z)) continue;
    const s = 0.7 + rand() * 0.7;
    Matrix.ComposeToRef(new Vector3(s, s, s), Quaternion.RotationYawPitchRoll(rand() * Math.PI * 2, 0, 0), new Vector3(x, 0, z), matrix);
    matrix.copyToArray(matrices, placed * 16);
    const v = 0.8 + rand() * 0.35;
    colors.set([v * (0.95 + rand() * 0.1), v * (0.95 + rand() * 0.1), v * (0.95 + rand() * 0.1), 1], placed * 4);
    placed++;
  }
  tuft.thinInstanceSetBuffer("matrix", matrices, 16, true);
  tuft.thinInstanceSetBuffer("color", colors, 4, true);
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
function fader(meshes: AbstractMesh[]): (alpha: number) => void {
  let ghosts: AbstractMesh[] | null = null;
  return (alpha) => {
    const solid = alpha >= 0.99;
    ghosts ??= meshes.map((m) => {
      if (!(m instanceof InstancedMesh)) return m;
      const g = m.sourceMesh.clone("ghost", m.parent, true);
      g.position.copyFrom(m.position);
      g.scaling.copyFrom(m.scaling);
      g.rotation.copyFrom(m.rotation);
      g.rotationQuaternion = m.rotationQuaternion?.clone() ?? null;
      g.isPickable = false;
      // A copy isn't an instance, so its tree's tint goes into a material of its own.
      const tint = m.instancedBuffers?.color as Color4 | undefined;
      if (tint && g.material instanceof StandardMaterial) {
        const tinted = g.material.clone("ghost");
        tinted.diffuseColor = tinted.diffuseColor.multiply(new Color3(tint.r, tint.g, tint.b));
        tinted.emissiveColor = tinted.emissiveColor.multiply(new Color3(tint.r, tint.g, tint.b));
        g.material = tinted;
      }
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

  buildSky(scene, spec, root);

  // Wider than he can walk, so the ground runs on into the haze under the mountains.
  const size = 300;
  const vary = random(spec.trees * 31 + 7); // looks only, so trees stay where they always were
  const ground = MeshBuilder.CreateGround("ground", { width: size, height: size }, scene);
  const floor = paintFloor(scene, spec, vary);
  floor.color.uScale = floor.color.vScale = size / FLOOR_TILE;
  const groundMat = material(scene, Color3.White());
  groundMat.diffuseTexture = floor.color;
  if (floor.glow) {
    floor.glow.uScale = floor.glow.vScale = size / FLOOR_TILE;
    groundMat.emissiveTexture = floor.glow;
  }
  const patches = paintPatches(scene, vary);
  patches.uScale = patches.vScale = size / 90;
  groundMat.ambientTexture = patches;
  ground.material = groundMat;
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
  // One cone, stretched into each tier of a pine or each spike of a dead tree, and tinted per tree.
  const coneShape = { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: spec.dead ? 6 : 10 };
  const crown = own(MeshBuilder.CreateCylinder("crown", coneShape, scene));
  crown.material = material(scene, hex(spec.crown));
  if (spec.crownGlows) (crown.material as StandardMaterial).emissiveColor = hex(spec.crown).scale(0.12);
  const cap = spec.cap ? own(MeshBuilder.CreateCylinder("cap", coneShape, scene)) : null;
  if (cap) cap.material = material(scene, hex(spec.cap!));
  for (const m of [trunk, crown]) {
    m.registerInstancedBuffer("color", 4);
    m.instancedBuffers.color = new Color4(1, 1, 1, 1);
  }
  for (const m of [trunk, crown, cap]) if (m) m.isVisible = false;
  const tiers = [
    [2, 2.4, 3.4], // bottom, height and width, in tree units
    [3.3, 2.2, 2.6],
    [4.5, 2.1, 1.8],
  ];
  const swaying: { node: TransformNode; phase: number }[] = [];

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
    const bark = 0.85 + vary() * 0.3;
    t.instancedBuffers.color = new Color4(bark, bark * (0.95 + vary() * 0.1), bark, 1);
    const shade = 0.82 + vary() * 0.36;
    const tint = [0, 0, 0].map(() => shade * (0.92 + vary() * 0.16));
    // The crown sways from the top of the trunk.
    const sway = new TransformNode("sway", scene);
    sway.parent = root;
    sway.position.set(x, 2 * s, z);
    sway.scaling.setAll(s);
    sway.rotation.y = vary() * Math.PI * 2;
    swaying.push({ node: sway, phase: vary() * 10 });
    const part = (source: Mesh, bottom: number, height: number, width: number, light = 1, tilt = 0, yaw = 0) => {
      const m = source.createInstance("c");
      m.parent = sway;
      m.isPickable = false;
      m.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, tilt, 0);
      m.scaling.set(width, height, width);
      m.position.set(0, bottom - 2, 0).addInPlace(Vector3.Up().applyRotationQuaternion(m.rotationQuaternion).scale(height / 2));
      if (source === crown) m.instancedBuffers.color = new Color4(tint[0] * light, tint[1] * light, tint[2] * light, 1);
      meshes.push(m);
    };
    if (spec.dead) {
      part(crown, 2.1, 3, 1.1);
      const yaw = vary() * Math.PI * 2;
      part(crown, 2.5 + vary() * 0.4, 1.3, 0.4, 1, 0.75, yaw);
      part(crown, 3.2 + vary() * 0.4, 1, 0.32, 1, 0.75, yaw + 2 + vary() * 2);
    } else
      tiers.forEach(([bottom, height, width], i) => {
        part(crown, bottom, height, width, 1 + i * 0.08);
        // Snow on the upper part of each tier, sized to sit exactly on its slope.
        if (cap) part(cap, bottom + height * 0.55 - 0.03, height * 0.45, width * 0.45 * 1.08);
      });
    meshes.forEach((m) => shadows.addShadowCaster(m));
    const tree = { x, z, radius: 0.7 * s, crown: (spec.dead ? 0.6 : 1.7) * s, height: (spec.dead ? 5.1 : 6.6) * s, meshes, fade: 1, setFade: fader(meshes) };
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

  if (spec.beds) {
    const straw = material(scene, hex(spec.beds));
    const hay = material(scene, hex(spec.beds).scale(0.8));
    for (const p of keepClear) {
      const rim = own(MeshBuilder.CreateTorus("bed", { diameter: 5.5, thickness: 1.1, tessellation: 24 }, scene));
      rim.material = straw;
      rim.scaling.y = 0.45;
      rim.position.set(p.x, 0.2, p.z);
      rim.receiveShadows = true;
      const mat = own(MeshBuilder.CreateDisc("hay", { radius: 2.4, tessellation: 24 }, scene));
      mat.material = hay;
      mat.rotation.x = Math.PI / 2;
      mat.position.set(p.x, 0.08, p.z);
      mat.receiveShadows = true;
    }
  }

  scatterTufts(scene, spec, root, vary, (x, z) => clear(x, z, 3) && obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.radius + 0.4));

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
    trees.push({ x, z, radius: 0, crown: 2.8, height: 5.6, meshes: parts, fade: 1, setFade: fader(parts) });

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
    sign.metadata = { sign: true };

    // The dragons living in the world it leads to, inside the top of the ring where the play camera sees it, facing the way he
    // comes from; the home has no wild dragons, so its portal has none.
    const tallyTexture = new DynamicTexture("tally", { width: TALLY_W, height: TALLY_H }, scene, false);
    tallyTexture.hasAlpha = true;
    const tallyMat = new StandardMaterial("tallyMat", scene);
    tallyMat.diffuseTexture = tallyTexture;
    tallyMat.emissiveColor = Color3.White();
    tallyMat.disableLighting = true;
    tallyMat.backFaceCulling = false;
    const tally = own(MeshBuilder.CreatePlane("tally", { width: 4.4, height: 1.1 }, scene));
    tally.parent = node;
    tally.position.set(0, 3.9, 0.35);
    tally.rotation.y = Math.PI;
    tally.material = tallyMat;
    tally.isPickable = false;
    tally.metadata = { sign: true };
    parts.push(tally); // fades with the portal
    tally.isVisible = p.to !== "home";

    return {
      to: p.to,
      needs: p.needs,
      x,
      z,
      disc,
      setFriends(friends: string[]) {
        const count = friends.length;
        const open = count >= p.needs;
        swirl.emissiveColor = open ? hex(AREAS[p.to].portalColor) : new Color3(0.15, 0.15, 0.18);
        swirl.diffuseColor = swirl.emissiveColor;
        sign.isVisible = !open;
        if (!open) drawSign(signTexture, p.needs, count);
        if (p.to !== "home") {
          drawTally(tallyTexture.getContext() as unknown as CanvasRenderingContext2D, p.to, friends);
          tallyTexture.update();
        }
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

  const swayer = scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    for (const { node, phase } of swaying) {
      node.rotation.x = 0.03 * Math.sin(t * 1.3 + phase);
      node.rotation.z = 0.03 * Math.sin(t * 1.05 + phase * 1.7);
    }
  });

  return {
    spec,
    ground,
    trees,
    obstacles,
    portals,
    stars,
    dispose: () => {
      scene.onBeforeRenderObservable.remove(swayer);
      root.dispose(false, true);
    },
  };
}
