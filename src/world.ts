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
  VertexData,
} from "./babylon";
import { AREAS, type AreaId, type AreaSpec, type Grade } from "./areas";
import { EDGE, gateOf, HOME_RADIUS, MAP_RADIUS, ownerAt, sliceOf, spawnOf, spokes, toMap, WORLDS } from "./map";
import { drawTally } from "./tally";

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

export interface Star {
  id: string;
  mesh: Mesh;
  baseY: number;
  collected: boolean;
}

const hex = (h: string) => Color3.FromHexString(h);

function material(scene: Scene, color: Color3, glows = false): StandardMaterial {
  const m = new StandardMaterial("m", scene);
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  if (glows) m.emissiveColor = color;
  return m;
}

// The glow layer draws only the meshes given to it here, so it costs a few draw calls instead of the whole scene again.
export function glowing<T extends Mesh>(m: T): T {
  m.getScene().getGlowLayerByName("glow")?.addIncludedOnlyMesh(m);
  return m;
}

// Seeded so the map looks the same every time he plays.
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUN = new Vector3(-0.5, -1, 0.4); // the light's direction
const SHADE_REACH = 20; // trees this close to the camera stay in the scene wherever it looks
const SWAY_REACH = 35;

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

// How finely to draw, best first. A device too slow for one steps down to the next at startup; every level keeps
// the film finish, and gives up sharpness and the smoothest edges instead.
export const QUALITY = [
  { pixels: 1.5, samples: 4, bloomKernel: 64 }, // pixels: the most screen pixels per CSS pixel to draw
  { pixels: 1.25, samples: 1, bloomKernel: 32 }, // one sample smooths edges with FXAA instead, much cheaper on an iPad
  { pixels: 1, samples: 1, bloomKernel: 32 },
];

export interface Film {
  grade(grade: Grade): void;
  quality(level: number): void;
}

// The film finish: tone mapping, bloom on whatever is brightest, smooth edges and a light vignette, graded per area.
export function setupFilm(scene: Scene, camera: ArcRotateCamera): Film {
  const film = new DefaultRenderingPipeline("film", true, scene, [camera]);
  film.bloomEnabled = true;
  film.bloomScale = 0.5;
  film.bloomWeight = 0.35;
  // The grade has a configuration of its own: changing the scene's tells every material, which flags every mesh,
  // about 6 ms each time on a Mac, and the grade changes every frame while he crosses between worlds.
  // The bloom still reads the scene's exposure, so it gets a typical one, once.
  scene.imageProcessingConfiguration.exposure = 1.2;
  const look = new ImageProcessingConfiguration();
  look.toneMappingEnabled = true;
  look.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  look.vignetteEnabled = true;
  look.vignetteWeight = 1.2;
  look.vignetteStretch = 0.6;
  look.vignetteColor = new Color4(0, 0, 0, 0);
  look.colorCurvesEnabled = true;
  const curves = new ColorCurves();
  look.colorCurves = curves;
  // Changing the finish rebuilds the pipeline, which goes back to the scene's configuration.
  const attach = () => (film.imageProcessing.imageProcessingConfiguration = look);
  attach();
  return {
    grade(grade) {
      look.exposure = grade.exposure;
      look.contrast = grade.contrast;
      curves.globalSaturation = grade.saturation;
      [curves.highlightsHue, curves.highlightsDensity] = grade.highlights;
      [curves.shadowsHue, curves.shadowsDensity] = grade.shadows;
      film.bloomThreshold = grade.bloom;
    },
    quality(level) {
      const q = QUALITY[level];
      scene.getEngine().setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, q.pixels));
      film.samples = q.samples;
      film.fxaaEnabled = q.samples === 1;
      film.bloomKernel = q.bloomKernel;
      attach();
    },
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
  if (h > top - 0.022) c = mix(c, peak, 0.85 * peaks);
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

// One sky over the whole map. Mountains stay put; their colors blend between the worlds he stands between.
function buildSky(scene: Scene): ShaderMaterial {
  const sky = new ShaderMaterial("sky", scene, { vertexSource: SKY_VERTEX, fragmentSource: SKY_FRAGMENT }, {
    attributes: ["position"],
    uniforms: ["worldViewProjection", "top", "horizon", "sunColor", "far", "near", "peak", "sunDir", "height", "seed", "peaks"],
  });
  sky.backFaceCulling = false;
  // Lower than the light itself, so he sees the sun glow above the mountains when he turns toward it.
  const sun = new Vector3(-SUN.x, 0, -SUN.z).normalize().scale(Math.cos(0.32));
  sun.y = Math.sin(0.32);
  sky.setVector3("sunDir", sun);
  sky.setFloat("seed", 3);
  const dome = MeshBuilder.CreateSphere("sky", { diameter: 800, segments: 24 }, scene);
  dome.material = sky;
  dome.isPickable = false;
  dome.infiniteDistance = true;
  return sky;
}

export type Weights = Map<AreaId, number>;

function mix(weights: Weights, of: (s: AreaSpec) => Color3): Color3 {
  const c = new Color3(0, 0, 0);
  for (const [id, w] of weights) c.addInPlace(of(AREAS[id]).scale(w));
  return c;
}

function sum(weights: Weights, of: (s: AreaSpec) => number): number {
  let n = 0;
  for (const [id, w] of weights) n += of(AREAS[id]) * w;
  return n;
}

// Hues are angles, so they blend the short way round.
function hue(weights: Weights, of: (s: AreaSpec) => [number, number]): [number, number] {
  let x = 0;
  let y = 0;
  let density = 0;
  for (const [id, w] of weights) {
    const [h, d] = of(AREAS[id]);
    x += Math.cos((h * Math.PI) / 180) * w;
    y += Math.sin((h * Math.PI) / 180) * w;
    density += d * w;
  }
  return [((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, density];
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
function scatterTufts(scene: Scene, spec: AreaSpec, root: TransformNode, rand: () => number, spot: () => [number, number] | null) {
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

  const count = spec.id === "home" ? 400 : spec.floor === "grass" ? 900 : spec.floor === "snow" ? 300 : 500;
  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 4);
  const matrix = new Matrix();
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 50; tries++) {
    const at = spot();
    if (!at) continue;
    const s = 0.7 + rand() * 0.7;
    Matrix.ComposeToRef(new Vector3(s, s, s), Quaternion.RotationYawPitchRoll(rand() * Math.PI * 2, 0, 0), new Vector3(at[0], 0, at[1]), matrix);
    matrix.copyToArray(matrices, placed * 16);
    const v = 0.8 + rand() * 0.35;
    colors.set([v * (0.95 + rand() * 0.1), v * (0.95 + rand() * 0.1), v * (0.95 + rand() * 0.1), 1], placed * 4);
    placed++;
  }
  tuft.thinInstanceSetBuffer("matrix", matrices.subarray(0, placed * 16), 16, true);
  tuft.thinInstanceSetBuffer("color", colors.subarray(0, placed * 4), 4, true);
}

// A sign on a locked line: one dragon per friend it needs, lit for each friend he has.
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
  // Eight friends for the King only fit smaller.
  const step = Math.min(92, 380 / needs);
  ctx.font = `${Math.min(72, step * 0.95)}px sans-serif`;
  for (let i = 0; i < needs; i++) {
    ctx.globalAlpha = i < friends ? 1 : 0.25;
    ctx.fillText("🐉", 120 + i * step, 68);
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

export interface World {
  grounds: Set<AbstractMesh>;
  trees: Tree[];
  obstacles: Obstacle[];
  stars: Star[];
  walls: Mesh[];
  setFriends(friends: string[]): void;
  look(weights: Weights): void;
}

const GROUND_REACH = 260; // the ground runs on past where he can go, into the haze under the mountains
const WALL_HEIGHT = 5;

// A flat piece of a ring on the ground, its texture laid in map coordinates so neighbouring pieces meet without a seam.
// With fade, it goes from solid on its inside edge to clear on its outside one.
function ringPiece(scene: Scene, r0: number, r1: number, a0: number, a1: number, fade = false): Mesh {
  const steps = Math.max(2, Math.ceil((a1 - a0) / 0.05));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    for (const [r, alpha] of [[r0, 1], [r1, fade ? 0 : 1]]) {
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      uvs.push(x / FLOOR_TILE, z / FLOOR_TILE);
      colors.push(1, 1, 1, alpha);
    }
    if (i < steps) indices.push(i * 2, i * 2 + 3, i * 2 + 1, i * 2, i * 2 + 2, i * 2 + 3);
  }
  const mesh = new Mesh("ground", scene);
  const v = new VertexData();
  v.positions = positions;
  v.normals = normals;
  v.uvs = uvs;
  v.indices = indices;
  if (fade) v.colors = colors;
  v.applyToMesh(mesh);
  mesh.hasVertexAlpha = fade;
  mesh.isPickable = false;
  return mesh;
}

// A see-through wall of light standing on a line, brightest at the ground and fading upward.
function curtain(scene: Scene, points: [number, number][], color: Color3, root: TransformNode): Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  points.forEach(([x, z], i) => {
    positions.push(x, 0, z, x, WALL_HEIGHT, z);
    colors.push(1, 1, 1, 0.3, 1, 1, 1, 0);
    if (i < points.length - 1) indices.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
  });
  const mesh = new Mesh("wall", scene);
  const v = new VertexData();
  v.positions = positions;
  v.colors = colors;
  v.indices = indices;
  v.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;
  const m = new StandardMaterial("wall", scene);
  m.diffuseColor = Color3.Black();
  m.emissiveColor = color;
  m.disableLighting = true;
  m.backFaceCulling = false;
  mesh.material = m;
  mesh.isPickable = false;
  mesh.parent = root;
  return mesh;
}

// A random spot in a region, spread evenly over its area, out to reach; null when it turns out to be a neighbour's.
function spotIn(id: AreaId, rand: () => number, reach: number): [number, number] | null {
  const home = id === "home";
  const [a0, a1] = home ? [0, Math.PI * 2] : sliceOf(id);
  const r0 = home ? 0 : HOME_RADIUS - EDGE;
  const r1 = home ? HOME_RADIUS : reach;
  const a = a0 + rand() * (a1 - a0);
  const r = Math.sqrt(r0 * r0 + rand() * (r1 * r1 - r0 * r0));
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  return ownerAt(x, z, rand()) === id ? [x, z] : null;
}

interface Shared {
  root: TransformNode;
  shadows: ShadowGenerator;
  clearOf: Vector3[];
  beds: Vector3[];
  collected: string[];
  world: World;
  swaying: Scenery[];
}

// A tree as the per-frame loop sees it: where it stands, what to hide when it's out of view, and its crown to sway.
interface Scenery {
  x: number;
  z: number;
  meshes: AbstractMesh[];
  node: TransformNode;
  phase: number;
  on: boolean;
}

// One region's ground, trees, rocks, sprinkles, tufts and stars, each only on its own part of the map.
function buildRegion(scene: Scene, spec: AreaSpec, { root, shadows, clearOf, beds, collected, world, swaying }: Shared) {
  const home = spec.id === "home";
  const vary = random(spec.trees * 31 + 7); // looks only, so trees stay where they are when looks change
  const rand = random(spec.id.length * 97 + spec.trees);
  const clear = (x: number, z: number, r: number) => clearOf.every((p) => Math.hypot(x - p.x, z - p.z) > r);
  const { trees, obstacles } = world;
  const own = <T extends AbstractMesh>(m: T): T => {
    m.parent = root;
    m.isPickable = false;
    return m;
  };

  const floor = paintFloor(scene, spec, vary);
  const groundMat = material(scene, Color3.White());
  groundMat.diffuseTexture = floor.color;
  if (floor.glow) groundMat.emissiveTexture = floor.glow;
  const patches = paintPatches(scene, vary);
  patches.uScale = patches.vScale = FLOOR_TILE / 90;
  groundMat.ambientTexture = patches;
  const [a0, a1] = home ? [0, Math.PI * 2] : sliceOf(spec.id);
  // The home sits a little above the worlds, its outer edge fading into theirs.
  const pieces = home
    ? [ringPiece(scene, 0, HOME_RADIUS - EDGE, a0, a1), ringPiece(scene, HOME_RADIUS - EDGE, HOME_RADIUS, a0, a1, true)]
    : [ringPiece(scene, HOME_RADIUS - EDGE - 1, GROUND_REACH, a0, a1)];
  for (const g of pieces) {
    g.material = groundMat;
    g.receiveShadows = true;
    g.parent = root;
    g.position.y = home ? 0.02 : 0;
    world.grounds.add(g);
    if (floor.glow) glowing(g);
  }

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

  let placed = 0;
  for (let tries = 0; placed < spec.trees && tries < spec.trees * 100; tries++) {
    const at = spotIn(spec.id, rand, MAP_RADIUS + 12);
    if (!at) continue;
    const [x, z] = at;
    if (!clear(x, z, home ? 7 : 10)) continue;
    const s = 0.8 + rand() * 0.8;
    const meshes: AbstractMesh[] = [];
    const t = own(trunk.createInstance("t"));
    t.position.set(x, 1.2 * s, z);
    t.scaling.setAll(s);
    t.freezeWorldMatrix();
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
    const phase = vary() * 10;
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
    swaying.push({ x, z, meshes, node: sway, phase, on: true });
    const tree = { x, z, radius: 0.7 * s, crown: (spec.dead ? 0.6 : 1.7) * s, height: (spec.dead ? 5.1 : 6.6) * s, meshes, fade: 1, setFade: fader(meshes) };
    trees.push(tree);
    obstacles.push(tree);
    placed++;
  }

  // Rocks and sprinkles never move or fade, so each kind is one mesh drawn many times, which costs one draw call
  // instead of one mesh apiece for the scene to check every frame.
  const rock = own(MeshBuilder.CreateSphere("rock", { diameter: 1.4, segments: 6 }, scene));
  rock.material = material(scene, hex(spec.rock));
  for (let i = 0; i < (home ? 8 : 30); i++) {
    const at = spotIn(spec.id, rand, MAP_RADIUS);
    if (!at || !clear(at[0], at[1], 6)) continue;
    const size = new Vector3(0.6 + rand(), 0.4 + rand() * 0.5, 0.6 + rand());
    rock.thinInstanceAdd(Matrix.Compose(size, Quaternion.Identity(), new Vector3(at[0], 0.2, at[1])), false);
  }

  const sprinkle = own(MeshBuilder.CreateSphere("sprinkle", { diameter: 0.25, segments: 4 }, scene));
  sprinkle.material = material(scene, hex(spec.sprinkle), spec.sprinkleGlows);
  for (let i = 0; i < (home ? 60 : 120); i++) {
    const at = spotIn(spec.id, rand, MAP_RADIUS);
    if (!at) continue;
    sprinkle.thinInstanceAdd(Matrix.Translation(at[0], 0.12, at[1]), false);
  }
  for (const m of [rock, sprinkle]) {
    m.thinInstanceBufferUpdated("matrix");
    m.thinInstanceRefreshBoundingInfo();
    m.isVisible = m.thinInstanceCount > 0;
  }
  if (spec.sprinkleGlows) glowing(sprinkle);

  if (spec.lava) {
    const lavaMat = material(scene, new Color3(1, 0.35, 0.1), true);
    let pools = 0;
    for (let tries = 0; pools < 9 && tries < 900; tries++) {
      const at = spotIn(spec.id, rand, MAP_RADIUS - 10);
      const radius = 2 + rand() * 2;
      if (!at || !clear(at[0], at[1], 9 + radius)) continue;
      const pool = own(MeshBuilder.CreateDisc("lava", { radius, tessellation: 24 }, scene));
      pool.material = lavaMat;
      glowing(pool);
      pool.rotation.x = Math.PI / 2;
      pool.position.set(at[0], 0.04, at[1]);
      obstacles.push({ x: at[0], z: at[1], radius });
      pools++;
    }
  }

  if (spec.beds) {
    const straw = material(scene, hex(spec.beds));
    const hay = material(scene, hex(spec.beds).scale(0.8));
    for (const p of beds) {
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

  scatterTufts(scene, spec, root, vary, () => {
    const at = spotIn(spec.id, vary, MAP_RADIUS);
    return at && clear(at[0], at[1], 3) && obstacles.every((o) => Math.hypot(at[0] - o.x, at[1] - o.z) > o.radius + 0.4) ? at : null;
  });

  const starMat = material(scene, new Color3(1, 0.85, 0.25), true);
  spec.stars.forEach(([x, y, z], i) => {
    const id = `${spec.id}-${i}`;
    if (collected.includes(id)) return;
    const mesh = own(MeshBuilder.CreatePolyhedron("star", { type: 1, size: 0.6 }, scene));
    mesh.material = starMat;
    mesh.position.copyFrom(toMap(spec.id, x, z));
    mesh.position.y = y;
    world.stars.push({ id, mesh: glowing(mesh), baseY: y, collected: false });
  });
}

// A picture on a board, always turned to face him, drawn unlit so it reads the same in every world.
function board(scene: Scene, width: number, height: number, root: TransformNode): { mesh: Mesh; texture: DynamicTexture } {
  const texture = new DynamicTexture("board", { width: 512, height: 128 }, scene, false);
  texture.hasAlpha = true;
  const m = new StandardMaterial("board", scene);
  m.diffuseTexture = texture;
  m.emissiveColor = Color3.White();
  m.disableLighting = true;
  m.backFaceCulling = false;
  const mesh = MeshBuilder.CreatePlane("board", { width, height }, scene);
  mesh.material = m;
  mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
  mesh.isPickable = false;
  mesh.parent = root;
  mesh.metadata = { sign: true };
  return { mesh, texture };
}

// The whole map at once: the home in the middle, every world around it, the lines between them, and a wall of light on the
// lines of each world he can't go into yet.
export function buildWorld(scene: Scene, shadows: ShadowGenerator, grade: (g: Grade) => void, keepClear: Vector3[], beds: Vector3[], collected: string[]): World {
  const root = new TransformNode("world", scene);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 45;
  scene.fogEnd = 95;
  const sky = buildSky(scene);

  const swaying: Scenery[] = [];
  const gates = WORLDS.map((id) => gateOf(id).scale((HOME_RADIUS - 1.5) / HOME_RADIUS)); // just on the home's side of each line
  // Clear of trees: dragons' spots, beds, the signs, where the lines meet, and a way from the middle out into each world.
  const ways = WORLDS.flatMap((id) => Array.from({ length: 9 }, (_, i) => spawnOf(id).at.scale(i / 8)));
  const corners = WORLDS.flatMap((id) => sliceOf(id).map((a) => new Vector3(Math.sin(a) * HOME_RADIUS, 0, Math.cos(a) * HOME_RADIUS)));
  const clearOf = [...keepClear, ...beds, ...gates, ...ways, ...corners];
  const world: World = { grounds: new Set(), trees: [], obstacles: [], stars: [], walls: [], setFriends: () => {}, look: () => {} };
  for (const spec of Object.values(AREAS)) buildRegion(scene, spec, { root, shadows, clearOf, beds, collected, world, swaying });

  // The lines: a ring round the home, and a spoke out between every two worlds.
  const lineMat = material(scene, hex("#fff2c8"), true);
  lineMat.disableLighting = true;
  const ring = ringPiece(scene, HOME_RADIUS - 0.2, HOME_RADIUS + 0.2, 0, Math.PI * 2);
  ring.material = lineMat;
  glowing(ring);
  ring.parent = root;
  ring.position.y = 0.06;
  for (const a of spokes()) {
    const spoke = MeshBuilder.CreateGround("line", { width: 0.4, height: MAP_RADIUS - HOME_RADIUS }, scene);
    spoke.material = lineMat;
    glowing(spoke);
    spoke.parent = root;
    spoke.isPickable = false;
    spoke.rotation.y = a;
    const mid = (HOME_RADIUS + MAP_RADIUS) / 2;
    spoke.position.set(Math.sin(a) * mid, 0.06, Math.cos(a) * mid);
  }

  const wood = material(scene, hex("#6b4a2a"));
  const gateSigns = WORLDS.map((id, i) => {
    const at = gates[i];
    const post = MeshBuilder.CreateCylinder("post", { height: 4.2, diameter: 0.3, tessellation: 8 }, scene);
    post.material = wood;
    post.parent = root;
    post.isPickable = false;
    post.position.set(at.x, 2.1, at.z);
    world.obstacles.push({ x: at.x, z: at.z, radius: 0.35 });
    // The world's dragons on the post, and over them, while it's locked, the friends it needs.
    const tally = board(scene, 4.4, 1.1, root);
    tally.mesh.position.set(at.x, 3.7, at.z);
    const lock = board(scene, 4, 1, root);
    lock.mesh.position.set(at.x, 5, at.z);
    // Listed with the trees so it fades when it stands between the camera and the wizard.
    const parts = [post, tally.mesh, lock.mesh];
    world.trees.push({ x: at.x, z: at.z, radius: 0, crown: 2.4, height: 5.6, meshes: parts, fade: 1, setFade: fader(parts) });
    return { id, tally, lock };
  });

  const locks = WORLDS.map((id) => {
    const spec = AREAS[id];
    const [a0, a1] = sliceOf(id);
    const out = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];
    const arc: [number, number][] = [];
    const steps = Math.ceil((a1 - a0) / 0.05);
    for (let i = 0; i <= steps; i++) arc.push(out(a0 + ((a1 - a0) * i) / steps, HOME_RADIUS));
    const wall = curtain(scene, [out(a0, MAP_RADIUS), ...arc, out(a1, MAP_RADIUS)], hex(spec.lineColor), root);
    world.walls.push(wall);
    // A sign halfway along each spoke too, a step inside the locked world, for when he walks up from the world next door.
    const mid = (HOME_RADIUS + MAP_RADIUS) / 2;
    const signs = [a0, a1].map((a) => {
      const inward = (a === a0 ? 1 : -1) * (1.2 / mid);
      const sign = board(scene, 4, 1, root);
      const [x, z] = out(a + inward, mid);
      sign.mesh.position.set(x, 3, z);
      return sign;
    });
    return { id, wall, signs };
  });

  world.setFriends = (friends) => {
    for (const { id, tally, lock } of gateSigns) {
      const open = friends.length >= AREAS[id].needs;
      drawTally(tally.texture.getContext() as unknown as CanvasRenderingContext2D, id, friends);
      tally.texture.update();
      lock.mesh.isVisible = !open;
      if (!open) drawSign(lock.texture, AREAS[id].needs, friends.length);
    }
    for (const { id, wall, signs } of locks) {
      const open = friends.length >= AREAS[id].needs;
      wall.isVisible = !open;
      for (const s of signs) {
        s.mesh.isVisible = !open;
        if (!open) drawSign(s.texture, AREAS[id].needs, friends.length);
      }
    }
  };

  world.look = (weights) => {
    const horizon = mix(weights, (s) => hex(s.sky));
    sky.setColor3("top", mix(weights, (s) => hex(s.skyTop)));
    sky.setColor3("horizon", horizon);
    sky.setColor3("sunColor", mix(weights, (s) => hex(s.sun)));
    sky.setColor3("far", mix(weights, (s) => hex(s.mountains[0])));
    sky.setColor3("near", mix(weights, (s) => hex(s.mountains[1])));
    sky.setColor3("peak", mix(weights, (s) => hex(s.peaks ?? s.sky)));
    sky.setFloat("peaks", sum(weights, (s) => (s.peaks ? 1 : 0)));
    sky.setFloat("height", sum(weights, (s) => (s.id === "summit" ? 0.07 : 0.12)));
    scene.clearColor = new Color4(horizon.r, horizon.g, horizon.b, 1);
    scene.fogColor = horizon;
    grade({
      exposure: sum(weights, (s) => s.grade.exposure),
      contrast: sum(weights, (s) => s.grade.contrast),
      saturation: sum(weights, (s) => s.grade.saturation),
      highlights: hue(weights, (s) => s.grade.highlights),
      shadows: hue(weights, (s) => s.grade.shadows),
      bloom: sum(weights, (s) => s.grade.bloom),
    });
  };

  // The scene checks every mesh it holds each frame, so a tree he can't see leaves it: one behind the camera, or past
  // the haze where it would be all fog. Trees close by stay, since their shadows reach the ground in view.
  // Only trees near him sway; far ones are too small to see it, and each moving crown costs a little.
  const ahead = new Vector3();
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    const camera = scene.activeCamera!;
    const eye = camera.position;
    camera.getDirectionToRef(Vector3.Forward(), ahead);
    const flat = Math.hypot(ahead.x, ahead.z) || 1;
    for (const tree of swaying) {
      const dx = tree.x - eye.x;
      const dz = tree.z - eye.z;
      const d = Math.hypot(dx, dz);
      // 60° either side: the view is about 32° each side on an iPad, and the rest covers a turn and the crowns' width.
      const on = d < SHADE_REACH || (d < scene.fogEnd && (dx * ahead.x + dz * ahead.z) / (d * flat) > 0.5);
      if (on !== tree.on) {
        tree.on = on;
        for (const m of tree.meshes) m.setEnabled(on);
      }
      if (!on || d > SWAY_REACH) continue;
      tree.node.rotation.x = 0.03 * Math.sin(t * 1.3 + tree.phase);
      tree.node.rotation.z = 0.03 * Math.sin(t * 1.05 + tree.phase * 1.7);
    }
  });

  return world;
}
