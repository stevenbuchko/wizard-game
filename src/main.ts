import {
  type AbstractMesh,
  ArcRotateCamera,
  Color3,
  Engine,
  GlowLayer,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "./babylon";
import { AREAS, type AreaId } from "./areas";
import { applyLook, makeDragon, makeWizard, SPELL_COLORS, type Dragon, type Spell } from "./characters";
import { DRAGONS, WEAKNESS, type Element } from "./dragons";
import { bolt, burst, trail, type Sparkle } from "./effects";
import { PathGrid } from "./path";
import { buildArea, setupFilm, setupLights, WORLD_RADIUS, type Area, type Star } from "./world";
import { setBattleMusic, setMuted, sfx, startMusic, unlockAudio } from "./audio";
import { load, MAX_FOLLOWERS, save } from "./save";
import { ui } from "./ui";

const WALK_SPEED = 5;
const FLY_SPEED = 11;
const FLY_HEIGHT = 8;
const FACE_OFF_DISTANCE = 7;
const STRONG_HIT = 34; // three strong spells befriend a dragon
const WEAK_HIT = 8;
const FRIEND_STRONG_HIT = 10; // friends help, but he still does most of the work
const FRIEND_WEAK_HIT = 3;
const SPELL_COOLDOWN = 0.7;
const SHIELD_TIME = 2.5;
const HEARTS = 3;
const WIZARD_RADIUS = 0.4;
const SADDLE = new Vector3(0, 2.55, -0.3);
const PET_SIZE = 0.4; // friends walking with him shrink to pets, so they don't fill the screen
const PET_HEIGHT = 0.7;
const GROW_TIME = 0.5;

const data = load();

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true });
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 1.5));
const scene = new Scene(engine);
const shadows = setupLights(scene);
const glow = new GlowLayer("glow", scene);
glow.intensity = 0.6;
// A portal or tree fading out of his way fades its glow too, or the bloom would hide him in light.
// Signs are white emissive only to show their pictures unlit; they block the glow behind them rather than glow themselves.
glow.customEmissiveColorSelector = (mesh, _subMesh, material, color) => {
  const e = mesh.metadata?.sign ? Color3.Black() : ((material as StandardMaterial).emissiveColor ?? Color3.Black());
  color.set(e.r * mesh.visibility, e.g * mesh.visibility, e.b * mesh.visibility, material.alpha);
};

const wizard = makeWizard(scene);
applyLook(wizard, data.look);
wizard.meshes.forEach((m) => shadows.addShadowCaster(m));

const dragons = DRAGONS.map((spec) => {
  const d = makeDragon(scene, spec);
  d.meshes.forEach((m) => shadows.addShadowCaster(m));
  if (data.friends.includes(spec.id)) makeFriend(d);
  return d;
});

// Each friend's bed at home: a ring open toward where he walks in, with the biggest at the back so it hides no one.
const beds = new Map<Dragon, Vector3>();
{
  const ring = dragons.filter((d) => (d.spec.size ?? 1) < 2);
  ring.forEach((d, i) => {
    const a = -2.6 + (5.2 * i) / Math.max(1, ring.length - 1);
    beds.set(d, new Vector3(Math.sin(a) * 22, 0, 4 + Math.cos(a) * 22));
  });
  dragons.filter((d) => !ring.includes(d)).forEach((d, i) => beds.set(d, new Vector3(i * 14, 0, 36)));
}

const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1.05, 14, new Vector3(0, 1.5, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 6;
camera.upperRadiusLimit = 30;
camera.lowerBetaLimit = 0.45;
camera.upperBetaLimit = 1.4;
camera.panningSensibility = 0;
camera.angularSensibilityX = 600;
camera.angularSensibilityY = 600;
const grade = setupFilm(scene, camera);

function glowMaterial(color: Color3, alpha = 1): StandardMaterial {
  const m = new StandardMaterial("glow", scene);
  m.diffuseColor = color;
  m.emissiveColor = color;
  m.alpha = alpha;
  m.disableLighting = true;
  return m;
}

const marker = MeshBuilder.CreateTorus("marker", { diameter: 1.2, thickness: 0.1, tessellation: 32 }, scene);
marker.material = glowMaterial(new Color3(1, 0.95, 0.6));
marker.isPickable = false;
marker.isVisible = false;

const shieldBubble = MeshBuilder.CreateSphere("shield", { diameter: 3.4 }, scene);
shieldBubble.material = glowMaterial(SPELL_COLORS.shield, 0.25);
shieldBubble.parent = wizard.root;
shieldBubble.position.y = 1.2;
shieldBubble.isPickable = false;
shieldBubble.isVisible = false;

type Mode = "title" | "wardrobe" | "explore" | "battle" | "nap" | "travel";
let mode: Mode = "title";
let now = 0;
let area: Area;
let grid: PathGrid;
let currentArea: AreaId = "forest";
let walkTarget: Vector3 | null = null;
let walkPath: Vector3[] = []; // waypoints on foot; walkTarget is the final tap
let walkPhase = 0;
let stuckFor = 0;
let wobble = 0;
let shake = 0;
let foe: Dragon | null = null;
let riding: Dragon | null = null;
let landing = false;
let hearts = HEARTS;
let shieldUntil = 0;
let cooldownUntil = 0;
let nextPuffAt = 0;
let windup = false;
let lockedHintUntil = 0;
const greetedAt = new Map<Dragon, number>();
let helpAt = new Map<Dragon, number>(); // when each friend next puffs at the dragon he's facing
let raisedUntil = new Map<Dragon, number>();
const petness = new Map<Dragon, number>(); // 0 is full size, 1 is pet size
const leaving = new Set<Dragon>(); // friends flying off home
let camCue: { until: number; radius: number; beta: number; alpha?: () => number } | null = null;

// Each effect runs once per frame until it returns false.
const effects: Array<(dt: number) => boolean> = [];

function yawTo(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, t);
}

function turnToward(node: TransformNode, at: Vector3, dt: number, speed: number) {
  node.rotation.y = lerpAngle(node.rotation.y, yawTo(node.position, at), dt * speed);
}

// The camera angle that puts the camera behind something facing this way.
function behind(yaw: number): number {
  return Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
}

function flatDistance(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function headOf(d: Dragon): Vector3 {
  return d.head.getAbsolutePosition().clone();
}

function wizardChest(): Vector3 {
  return wizard.root.getAbsolutePosition().add(new Vector3(0, 1.3, 0));
}

function makeFriend(d: Dragon) {
  d.friend = true;
  d.grump = 0;
  d.skin.emissiveColor = d.skin.diffuseColor.scale(0.2);
  d.heart.isVisible = true;
}

// The friends he chose walk with him; on the summit, every friend does.
function followers(): Dragon[] {
  const ids = currentArea === "summit" ? data.friends : data.following;
  return ids.map((id) => dragons.find((d) => d.spec.id === id)).filter((d): d is Dragon => !!d?.friend);
}

// A dragon with phases (the King) switches element each time it calms down another step.
function phaseOf(d: Dragon): number {
  const n = d.spec.phases?.length ?? 1;
  return Math.min(n - 1, Math.floor(((100 - d.grump) / 100) * n));
}

function elementOf(d: Dragon): Element {
  return d.spec.phases?.[phaseOf(d)] ?? d.spec.element;
}

function weaknessOf(d: Dragon): Element {
  return d.spec.phases ? WEAKNESS[elementOf(d)] : d.spec.weakTo;
}

const BAR_COLORS: Record<Element, string> = { fire: "#d85a30", ice: "#378add", lightning: "#ef9f27" };

function showGrump(d: Dragon) {
  ui.grump(d.grump / 100, d.spec.phases ? BAR_COLORS[elementOf(d)] : undefined);
}

// Big dragons start the face-off further away, so the camera fits them.
function reach(d: Dragon): number {
  return FACE_OFF_DISTANCE + Math.max(0, (d.spec.size ?? 1) - 1.5) * 14;
}

// Wild dragons stay in their area and friends not walking with him wait at home, so every dragon out in an area is one to face.
function updatePresence() {
  const walking = followers();
  for (const d of dragons) d.root.setEnabled(walking.includes(d) || leaving.has(d) || (d.friend ? currentArea === "home" : d.spec.area === currentArea));
}

// A friend he stops walking with flies off home, rather than standing about out here looking wild.
function flyHome(d: Dragon) {
  leaving.add(d);
  sfx.whoosh();
  effects.push((dt) => {
    if (!leaving.has(d)) return false;
    d.root.position.y += dt * 12;
    if (d.root.position.y < 30) return true;
    leaving.delete(d);
    updatePresence();
    return false;
  });
}

// At home, tapping a friend has it walk with him, or go back to its bed. The oldest choice makes room for a new one.
function swap(d: Dragon) {
  if (currentArea !== "home" || !d.friend) return;
  const i = data.following.indexOf(d.spec.id);
  if (i >= 0) {
    data.following.splice(i, 1);
    sfx.tap();
  } else {
    data.following.push(d.spec.id);
    if (data.following.length > MAX_FOLLOWERS) data.following.shift();
    sfx.friend();
  }
  save(data);
  d.flinch = 0.6;
  burst(scene, headOf(d), "gold", 40);
}

function pushOut(p: Vector3, radius: number) {
  for (const o of area.obstacles) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.radius + radius;
    if (d < min && d > 0.001) {
      p.x = o.x + (dx / d) * min;
      p.z = o.z + (dz / d) * min;
    }
  }
}

// Hides any tree standing between the camera and the wizard, so he never disappears behind one.
function updateTrees(dt: number) {
  const cam = camera.position;
  const eye = wizardChest();
  const dx = eye.x - cam.x;
  const dz = eye.z - cam.z;
  const len2 = dx * dx + dz * dz || 1;
  for (const tree of area.trees) {
    const t = ((tree.x - cam.x) * dx + (tree.z - cam.z) * dz) / len2;
    let hide = false;
    if (t > 0 && t < 1) {
      const sightHeight = cam.y + (eye.y - cam.y) * t;
      const off = Math.hypot(tree.x - (cam.x + dx * t), tree.z - (cam.z + dz * t));
      hide = off < tree.crown + 0.8 && sightHeight < tree.height;
    }
    const goal = hide ? 0.2 : 1;
    if (tree.fade === goal) continue;
    tree.fade = goal > tree.fade ? Math.min(goal, tree.fade + dt * 4) : Math.max(goal, tree.fade - dt * 4);
    tree.setFade(tree.fade);
  }
}

function enterArea(id: AreaId, from?: AreaId) {
  area?.dispose();
  currentArea = id;
  const spec = AREAS[id];
  leaving.clear();
  const homes = id === "home" ? [...beds.values()] : DRAGONS.filter((d) => d.area === id).map((d) => new Vector3(d.home[0], 0, d.home[1]));
  area = buildArea(scene, spec, shadows, homes, data.stars);
  grade(spec.grade);
  grid = new PathGrid(area.obstacles, WIZARD_RADIUS + 0.1);

  const arrival = from ? area.portals.find((p) => p.to === from) : undefined;
  const spawn = arrival ? new Vector3(arrival.x, 0, arrival.z) : new Vector3(spec.spawn[0], 0, spec.spawn[1]);
  if (arrival) spawn.subtractInPlace(spawn.normalizeToNew().scale(9)); // step out of the portal, toward the middle
  wizard.root.position.copyFrom(spawn);
  wizard.root.rotation.y = yawTo(spawn, Vector3.Zero());
  walkTarget = null;
  marker.isVisible = false;

  const walking = followers();
  for (const d of dragons) {
    if (walking.includes(d)) continue;
    petness.set(d, 0);
    d.root.scaling.setAll(d.fullSize);
    if (d.friend) d.root.position.copyFrom(beds.get(d)!);
    else d.root.position.set(d.spec.home[0], 0, d.spec.home[1]);
    d.root.rotation.y = yawTo(d.root.position, spawn);
  }
  const yaw = wizard.root.rotation.y;
  walking.forEach((d, i) => {
    // A friend that just joined him arrives as a pet; one already walking with him stays one.
    if (!petness.has(d)) petness.set(d, 1);
    updateSize(d, true, 0);
    d.root.position.copyFrom(followSpot(i, wizard.root));
    d.root.rotation.y = yaw;
  });
  updatePresence();
  area.portals.forEach((p) => p.setFriends(data.friends));
  ui.tally(id, data.friends);
  camera.target.copyFrom(spawn).addInPlace(new Vector3(0, 1.5, 0));
  camera.alpha = behind(yaw);
}

function travel(to: AreaId) {
  mode = "travel";
  sfx.portal();
  ui.fade(true);
  setTimeout(() => {
    enterArea(to, currentArea);
    ui.fade(false);
    mode = "explore";
  }, 450);
}

function orb(from: Vector3, to: () => Vector3, kind: Sparkle, duration: number, onArrive: () => void) {
  const m = MeshBuilder.CreateSphere("orb", { diameter: 0.5, segments: 8 }, scene);
  m.material = glowMaterial(kind === "gold" ? new Color3(1, 0.85, 0.3) : SPELL_COLORS[kind]);
  m.isPickable = false;
  m.position.copyFrom(from);
  const stopTrail = trail(scene, m, kind);
  let t = 0;
  effects.push((dt) => {
    t = Math.min(1, t + dt / duration);
    Vector3.LerpToRef(from, to(), t, m.position);
    m.position.y += Math.sin(t * Math.PI) * 1.2;
    if (t < 1) return true;
    stopTrail();
    m.dispose();
    onArrive();
    return false;
  });
}

function walkTo(point: Vector3) {
  const p = point.clone();
  p.y = 0;
  if (p.length() > WORLD_RADIUS) p.normalize().scaleInPlace(WORLD_RADIUS);
  if (!riding) {
    const path = grid.find(wizard.root.position, p);
    if (!path || !path.length) return;
    walkPath = path;
    p.copyFrom(path[path.length - 1]);
  }
  walkTarget = p;
  stuckFor = 0;
  marker.position.set(p.x, 0.06, p.z);
  marker.isVisible = true;
  sfx.tap();
}

function startBattle(d: Dragon) {
  mode = "battle";
  foe = d;
  walkTarget = null;
  marker.isVisible = false;
  nextPuffAt = now + 4;
  windup = false;
  const big = Math.max(0, (d.spec.size ?? 1) - 1.5);
  camCue = {
    until: now + 1.2,
    radius: 17 + big * 20,
    beta: 1.15,
    alpha: () => Math.atan2(wizard.root.position.z - d.root.position.z, wizard.root.position.x - d.root.position.x),
  };
  showGrump(d);
  ui.battle(true);
  setBattleMusic(true);
  sfx.roar();
  const helpers = followers();
  const spacing = 1.1 * Math.max(1, helpers.length / 3);
  helpAt = new Map(helpers.map((f, i) => [f, now + 2.5 + i * spacing]));
  if (d.spec.phases) {
    tint(d);
    // Every friend swoops down from the sky to help.
    helpers.forEach((f) => (f.root.position.y = 12));
    sfx.whoosh();
    ui.banner("👑", 2);
  }
}

function tint(d: Dragon) {
  d.skin.emissiveColor = SPELL_COLORS[elementOf(d)].scale(0.35);
}

function endBattle() {
  foe = null;
  helpAt.clear();
  windup = false;
  ui.battle(false);
  setBattleMusic(false);
}

function cast(spell: Spell) {
  if (mode !== "battle" || !foe || now < cooldownUntil) return;
  cooldownUntil = now + SPELL_COOLDOWN;
  ui.cooldown(SPELL_COOLDOWN);
  sfx[spell]();
  if (spell === "shield") {
    shieldUntil = now + SHIELD_TIME;
    burst(scene, wizardChest(), "shield", 30);
    return;
  }
  const target = foe;
  const from = wizard.crystal.getAbsolutePosition().clone();
  if (spell === "lightning") {
    bolt(scene, from, headOf(target));
    setTimeout(() => hit(target, spell, false), 120);
    return;
  }
  orb(from, () => headOf(target), spell, 0.45, () => hit(target, spell, false));
}

function hit(target: Dragon, spell: Spell, byFriend: boolean) {
  if (foe !== target) return;
  const strong = spell === weaknessOf(target);
  // Tougher dragons take more hits: the same three-hit damage, spread over their hits.
  // A crowd of friends shares the help, so he still does the work.
  const scale = (3 / (target.spec.hits ?? 3)) * (byFriend ? Math.min(1, 3 / helpAt.size) : 1);
  const damage = byFriend ? (strong ? FRIEND_STRONG_HIT : FRIEND_WEAK_HIT) : strong ? STRONG_HIT : WEAK_HIT;
  const phase = phaseOf(target);
  target.grump = Math.max(0, target.grump - damage * scale);
  target.flinch = strong ? 1 : 0.3;
  burst(scene, headOf(target), spell, strong ? 70 : 15);
  if (byFriend) sfx.weak();
  else if (strong) {
    shake = 0.5;
    sfx.strong();
  } else {
    sfx.weak();
  }
  showGrump(target);
  if (target.grump === 0) befriend(target);
  else if (phaseOf(target) !== phase) newPhase(target);
}

// The King changes element: a roar, a flash of the new color, and a moment before it puffs again.
function newPhase(d: Dragon) {
  tint(d);
  sfx.roar();
  shake = 0.6;
  burst(scene, headOf(d), elementOf(d), 90);
  windup = false;
  nextPuffAt = Math.max(nextPuffAt, now + 2.5);
}

function friendHelp(f: Dragon, target: Dragon) {
  raisedUntil.set(f, now + 0.6);
  const kind = f.spec.phases ? elementOf(f) : f.spec.element;
  orb(headOf(f), () => headOf(target), kind, 0.7, () => hit(target, kind, true));
}

function befriend(d: Dragon) {
  const before = followers();
  makeFriend(d);
  helpAt.clear();
  data.friends.push(d.spec.id);
  // A new friend walks with him, and the oldest choice flies home to make room.
  data.following.push(d.spec.id);
  if (data.following.length > MAX_FOLLOWERS) data.following.shift();
  save(data);
  endBattle();
  mode = "explore";
  burst(scene, headOf(d), "gold", 120);
  const walking = followers();
  before.filter((f) => !walking.includes(f) && currentArea !== "home").forEach(flyHome);
  updatePresence();
  const count = data.friends.length;
  ui.friends(count, dragons.length);
  area.portals.forEach((p) => p.setFriends(data.friends));
  ui.tally(currentArea, data.friends, true);
  if (count === dragons.length) {
    sfx.celebrate();
    ui.banner("🎉🐉🎉", 4);
    for (let i = 0; i < 4; i++) setTimeout(() => burst(scene, wizardChest().add(new Vector3(0, 3, 0)), "gold", 100), i * 400);
    return;
  }
  sfx.friend();
  ui.banner("🐉💛", 2.5);
  // Tell him when a new friend opens a portal anywhere.
  const opened = Object.values(AREAS).some((a) => a.portals.some((p) => p.needs === count));
  if (opened) setTimeout(() => { sfx.portal(); ui.banner("🔓✨", 2); }, 2700);
}

function dragonPuff(d: Dragon) {
  orb(headOf(d), wizardChest, elementOf(d), 0.8, () => {
    if (foe !== d) return;
    if (now < shieldUntil) {
      sfx.block();
      burst(scene, wizardChest(), "shield", 40);
      return;
    }
    hearts--;
    wobble = 1;
    shake = 0.35;
    ui.hearts(hearts);
    sfx.hurt();
    if (hearts <= 0) nap(d);
  });
}

// Losing is a nap, never a game over: back to the area's start, hearts refilled.
function nap(d: Dragon) {
  endBattle();
  mode = "nap";
  ui.banner("💤", 2);
  setTimeout(() => {
    const [x, z] = AREAS[currentArea].spawn;
    wizard.root.position.set(x, 0, z);
    d.grump = 100;
    if (d.spec.phases) tint(d);
    hearts = HEARTS;
    ui.hearts(hearts);
    mode = "explore";
  }, 2000);
}

function walkAway() {
  if (!foe) return;
  const d = foe;
  d.calmUntil = now + 4;
  endBattle();
  mode = "explore";
  const away = wizard.root.position.subtract(d.root.position);
  away.y = 0;
  walkTo(wizard.root.position.add(away.normalize().scale(6)));
}

function toggleRide() {
  if (mode !== "explore") return;
  if (riding) {
    landing = true;
    walkTarget = null;
    marker.isVisible = false;
    return;
  }
  const choices = followers();
  if (!choices.length) return;
  const d = choices.reduce((a, b) => (flatDistance(a.root.position, wizard.root.position) < flatDistance(b.root.position, wizard.root.position) ? a : b));
  riding = d;
  landing = false;
  walkTarget = null;
  marker.isVisible = false;
  wizard.root.parent = d.root;
  wizard.root.position.copyFrom(SADDLE);
  wizard.root.rotation.y = 0;
  wizard.root.scaling.setAll(1 / d.root.scaling.x);
  burst(scene, wizardChest(), "gold", 40);
  sfx.whoosh();
  camCue = { until: now + 1.5, radius: 24, beta: 1.0 };
}

function dismount() {
  const d = riding!;
  riding = null;
  landing = false;
  wizard.root.parent = null;
  wizard.root.scaling.setAll(1);
  const side = new Vector3(Math.cos(d.root.rotation.y), 0, -Math.sin(d.root.rotation.y)).scale(3);
  wizard.root.position.copyFrom(d.root.position).addInPlace(side);
  wizard.root.position.y = 0;
  pushOut(wizard.root.position, WIZARD_RADIUS);
  wizard.root.rotation.y = d.root.rotation.y;
  camCue = { until: now + 1.2, radius: 14, beta: 1.05 };
  // Landed next to a wild dragon: face it straight away.
  const wild = dragons.find((w) => w.root.isEnabled() && !w.friend && now > w.calmUntil && flatDistance(wizard.root.position, w.root.position) < reach(w) + 5);
  if (wild) startBattle(wild);
}

function collect(star: Star) {
  star.collected = true;
  burst(scene, star.mesh.position, "gold", 60);
  star.mesh.dispose();
  data.stars.push(star.id);
  save(data);
  ui.stars(data.stars.length);
  sfx.star();
}

function updateWizard(dt: number) {
  wobble = Math.max(0, wobble - dt * 1.5);
  wizard.body.rotation.z = Math.sin(now * 30) * 0.25 * wobble;
  shieldBubble.isVisible = now < shieldUntil;
  marker.scaling.setAll(1 + Math.sin(now * 6) * 0.1);
  wizard.crystal.rotation.y += dt * 1.5;
  if (riding) {
    // The dragon grows under him, so his size follows its scale to stay the same in the world.
    wizard.root.scaling.setAll(1 / riding.root.scaling.x);
    wizard.body.position.y = Math.sin(now * 3) * 0.05;
    return;
  }

  const pos = wizard.root.position;
  let walking = false;
  if (walkTarget && mode === "explore") {
    while (walkPath.length > 1 && flatDistance(pos, walkPath[0]) < 0.3) walkPath.shift();
    const next = walkPath[0] ?? walkTarget;
    const to = next.subtract(pos);
    to.y = 0;
    const dist = to.length();
    if (dist < 0.2 && walkPath.length <= 1) {
      walkTarget = null;
      walkPath = [];
      marker.isVisible = false;
    } else {
      walking = true;
      const step = Math.min(dist, WALK_SPEED * dt);
      const before = pos.clone();
      pos.addInPlace(to.normalize().scale(step));
      pushOut(pos, WIZARD_RADIUS);
      turnToward(wizard.root, next, dt, 10);
      // Pressed against a tree with nowhere to slide: give up rather than walk on the spot.
      stuckFor = Vector3.Distance(before, pos) < step * 0.3 ? stuckFor + dt : 0;
      if (stuckFor > 0.5) {
        walkTarget = null;
        marker.isVisible = false;
      }
    }
  }
  if (foe) turnToward(wizard.root, foe.root.position, dt, 6);
  walkPhase += walking ? dt * 12 : 0;
  wizard.body.position.y = walking ? Math.abs(Math.sin(walkPhase)) * 0.12 : 0;

  if (mode !== "explore") return;
  for (const p of area.portals) {
    if (Math.hypot(pos.x - p.x, pos.z - p.z) > 2.6) continue;
    if (data.friends.length >= p.needs) {
      travel(p.to);
      return;
    }
    if (now > lockedHintUntil) {
      lockedHintUntil = now + 3;
      sfx.locked();
      ui.banner("🔒", 1.2);
    }
  }
  const pets = followers();
  for (const d of dragons) {
    if (!d.root.isEnabled() || flatDistance(pos, d.root.position) >= reach(d)) continue;
    if (!d.friend && now > d.calmUntil) {
      startBattle(d);
      return;
    }
    // A friend waiting at home says hello instead, so he knows it's already his. Pets beside him would greet him nonstop.
    if (d.friend && !pets.includes(d) && now > (greetedAt.get(d) ?? 0)) {
      greetedAt.set(d, now + 8);
      d.flinch = 0.6;
      burst(scene, headOf(d), "gold", 40);
      sfx.star();
    }
  }
}

function updateRide(dt: number) {
  if (!riding) return;
  const d = riding;
  const p = d.root.position;
  p.y += ((landing ? 0 : FLY_HEIGHT) - p.y) * Math.min(1, dt * (landing ? 3 : 1.5));
  if (landing && p.y < 0.08) {
    dismount();
    return;
  }
  // Flying up to a wild dragon lands him, and the face-off starts on the ground.
  if (!landing && dragons.some((w) => w.root.isEnabled() && !w.friend && now > w.calmUntil && flatDistance(p, w.root.position) < reach(w) + 3)) {
    landing = true;
    walkTarget = null;
    marker.isVisible = false;
  }
  if (walkTarget && !landing) {
    const to = walkTarget.subtract(p);
    to.y = 0;
    const dist = to.length();
    if (dist < 0.6) {
      walkTarget = null;
      marker.isVisible = false;
    } else {
      p.addInPlace(to.normalize().scale(Math.min(dist, FLY_SPEED * dt)));
      turnToward(d.root, walkTarget, dt, 3);
    }
  }
  const flat = Math.hypot(p.x, p.z);
  if (flat > WORLD_RADIUS) {
    p.x *= WORLD_RADIUS / flat;
    p.z *= WORLD_RADIUS / flat;
  }
  const body = p.add(new Vector3(0, 2.5, 0));
  for (const s of area.stars) if (!s.collected && Vector3.Distance(body, s.mesh.position) < 3.5) collect(s);
}

// Where the i-th friend walking with him goes, never between him and the camera: as pets, beside his shoulders;
// in the air, clear of the wings of the dragon he rides; in a face-off, further out to leave the view clear.
function followSpot(i: number, leader: TransformNode): Vector3 {
  const back = new Vector3(Math.sin(leader.rotation.y), 0, Math.cos(leader.rotation.y)).scale(-1);
  const side = new Vector3(back.z, 0, -back.x).scale(i % 2 ? 1 : -1);
  const rank = Math.floor(i / 2);
  if (foe) return leader.position.add(side.scale(10 + rank * 3)).add(back.scale(2 - rank * 3));
  if (riding) return leader.position.add(back.scale(2 + rank * 2)).add(side.scale(5.5 + rank * 2.5));
  // Pets go by the camera, not his heading: off his left and right on screen, however he turns.
  const w = wizard.root.position;
  const view = new Vector3(w.x - camera.position.x, 0, w.z - camera.position.z).normalize();
  const right = new Vector3(view.z, 0, -view.x).scale(i % 2 ? -1 : 1);
  return w.add(right.scale(2.3 + rank * 1.4)).add(view.scale(0.6 + rank * 1.2)).add(new Vector3(0, PET_HEIGHT + rank * 0.8, 0));
}

// Friends walking with him are pets; the one he rides, friends in a face-off and friends at home are full size.
function updateSize(d: Dragon, pet: boolean, dt: number) {
  const p = Math.max(0, Math.min(1, (petness.get(d) ?? 0) + (pet ? dt : -dt) / GROW_TIME));
  petness.set(d, p);
  const ease = p * p * (3 - 2 * p);
  d.root.scaling.setAll(d.fullSize * (1 - (1 - PET_SIZE) * ease));
}

function updateDragons(dt: number) {
  const leader = riding ? riding.root : wizard.root;
  const walking = followers().filter((d) => d !== riding);
  for (const d of dragons) {
    if (!d.root.isEnabled()) continue;
    let moving = d === riding && !!walkTarget;
    const i = walking.indexOf(d);
    updateSize(d, i >= 0 && !foe, dt);
    if (i >= 0) {
      const goal = followSpot(i, leader);
      const to = goal.subtract(d.root.position);
      to.y = 0;
      const dist = to.length();
      if (dist > 0.8) {
        moving = true;
        d.root.position.addInPlace(to.normalize().scale(Math.min(dist, Math.min(dist * (riding || foe ? 1.5 : 3), riding ? FLY_SPEED : 8) * dt)));
        turnToward(d.root, goal, dt, 4);
      }
      const height = riding ? FLY_HEIGHT : foe ? 0 : goal.y + Math.sin(d.phase * 0.5) * 0.12;
      d.root.position.y += (height - d.root.position.y) * Math.min(1, dt * 1.5);
      if (d.root.position.y > 0.5) moving = true;
      if (foe) turnToward(d.root, foe.root.position, dt, 4);
    } else if (d === foe) {
      turnToward(d.root, wizard.root.position, dt, 5);
    } else if (d.friend && currentArea === "home" && !leaving.has(d)) {
      // Sent back to its bed, it walks there, then turns to watch him.
      const bed = beds.get(d)!;
      const to = bed.subtract(d.root.position);
      to.y = 0;
      const dist = to.length();
      if (dist > 0.8) {
        moving = true;
        d.root.position.addInPlace(to.normalize().scale(Math.min(dist, Math.min(dist * 1.5, 8) * dt)));
        turnToward(d.root, bed, dt, 4);
      } else {
        turnToward(d.root, wizard.root.position, dt, 1.5);
      }
      d.root.position.y += (0 - d.root.position.y) * Math.min(1, dt * 3);
      if (d.root.position.y > 0.5) moving = true;
    }
    if (leaving.has(d)) moving = true;
    if (d === riding && d.root.position.y > 0.5) moving = true;
    d.phase += dt * (moving ? 7 : 1.6);
    const flap = 0.35 + Math.sin(d.phase) * (moving ? 0.5 : 0.25);
    d.wings[0].rotation.z = -flap;
    d.wings[1].rotation.z = flap;
    d.flinch = Math.max(0, d.flinch - dt * 2.5);
    d.root.rotation.z = Math.sin(now * 40) * 0.06 * d.flinch;
    const lookUp = (d === foe && windup) || (raisedUntil.get(d) ?? 0) > now ? -0.5 : 0;
    d.head.rotation.x += (lookUp - d.head.rotation.x) * Math.min(1, dt * 8);
    d.head.position.y = d.headBaseY + Math.sin(d.phase * 0.5) * 0.06;
  }
}

function updateBattle() {
  if (mode !== "battle" || !foe) return;
  // Friends take turns puffing; with a crowd of them (the King's battle) each puffs less often.
  for (const [f, at] of helpAt) {
    if (now < at || f.root.position.y > 1) continue;
    friendHelp(f, foe);
    helpAt.set(f, now + (4 + Math.random() * 2) * Math.max(1, helpAt.size / 3));
  }
  // The dragon looks up for a moment before it puffs, so he has time to tap the shield.
  if (!windup && now > nextPuffAt - 0.8) {
    windup = true;
    sfx.growl();
  }
  if (now >= nextPuffAt) {
    windup = false;
    dragonPuff(foe);
    nextPuffAt = now + 4.5 + Math.random() * 1.5;
  }
}

function updateWorld(dt: number) {
  for (const s of area.stars) {
    s.mesh.rotation.y += dt * 2;
    s.mesh.position.y = s.baseY + Math.sin(now * 2 + s.baseY) * 0.3;
  }
  for (const p of area.portals) p.disc.rotation.z += dt;
}

function updateCamera(dt: number) {
  const w = wizard.root.position;
  let goal: Vector3;
  if (mode === "battle" && foe) goal = Vector3.Center(w, foe.root.position).add(new Vector3(0, 2.5 * Math.max(1, (foe.spec.size ?? 1) * 0.8), 0));
  else if (riding) goal = riding.root.position.add(new Vector3(0, 3, 0));
  else goal = w.add(new Vector3(0, mode === "wardrobe" ? 1.4 : 1.5, 0));
  Vector3.LerpToRef(camera.target, goal, Math.min(1, dt * 4), camera.target);

  if (mode === "wardrobe") {
    // Face the wizard from the front, close up, while he dresses.
    const yaw = wizard.root.rotation.y;
    camCue = { until: now + 1, radius: 6, beta: 1.35, alpha: () => Math.atan2(Math.cos(yaw), Math.sin(yaw)) };
  }
  if (camCue && now < camCue.until) {
    if (camCue.alpha) camera.alpha = lerpAngle(camera.alpha, camCue.alpha(), dt * 4);
    camera.radius += (camCue.radius - camera.radius) * Math.min(1, dt * 3);
    camera.beta += (camCue.beta - camera.beta) * Math.min(1, dt * 3);
  }
  shake = Math.max(0, shake - dt * 1.5);
  // While dressing, he stands left of center, clear of the picker on the right.
  camera.targetScreenOffset.set((mode === "wardrobe" ? -1.8 : 0) + (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
}

// Any part of a dragon, its heart included, counts as tapping it.
const pickable = new Map<AbstractMesh, Dragon>();
for (const d of dragons) for (const m of [...d.meshes, d.heart]) pickable.set(m, d);

// A quick touch that barely moves is a tap to walk or fly; anything else turns or zooms the camera.
let down: { x: number; y: number; t: number } | null = null;
scene.onPointerObservable.add((info) => {
  const e = info.event as PointerEvent;
  if (info.type === PointerEventTypes.POINTERDOWN) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (info.type !== PointerEventTypes.POINTERUP || !down) return;
  const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.t < 400;
  down = null;
  if (!tap || mode !== "explore" || landing) return;
  if (currentArea === "home" && !riding) {
    const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => pickable.has(m) && m.isEnabled() && m.isVisible);
    const d = hit?.pickedMesh && pickable.get(hit.pickedMesh);
    if (d && d.friend) {
      swap(d);
      return;
    }
  }
  const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === area.ground);
  if (pick?.hit && pick.pickedPoint) walkTo(pick.pickedPoint);
});

ui.onStart(() => {
  unlockAudio();
  setMuted(data.muted);
  startMusic();
  mode = "explore";
  camCue = { until: now + 1.2, radius: 14, beta: 1.05, alpha: () => behind(wizard.root.rotation.y) };
  ui.banner("👆", 1.5);
});
ui.onWardrobe(
  data.look,
  data.name,
  () => {
    // His friends stand around the spawn and would block the close-up, so they step out while he dresses.
    mode = "wardrobe";
    followers().forEach((d) => d.root.setEnabled(false));
  },
  (look, name) => {
    applyLook(wizard, look);
    data.name = name;
    ui.title(name);
    save(data);
  },
  () => {
    mode = "title";
    updatePresence();
  },
);
ui.onSpell(cast);
ui.onRun(walkAway);
ui.onRide(toggleRide);
ui.onMute(() => {
  data.muted = !data.muted;
  unlockAudio();
  setMuted(data.muted);
  ui.muted(data.muted);
  save(data);
});
ui.title(data.name);
ui.hearts(hearts);
ui.friends(data.friends.length, dragons.length);
ui.stars(data.stars.length);
ui.muted(data.muted);

enterArea("forest");

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  now += dt;
  updateRide(dt);
  updateWizard(dt);
  updateDragons(dt);
  updateBattle();
  updateWorld(dt);
  updateCamera(dt);
  updateTrees(dt);
  ui.ride(mode !== "explore" ? "hidden" : riding ? "land" : followers().length ? "mount" : "hidden");
  for (let i = effects.length - 1; i >= 0; i--) if (!effects[i](dt)) effects.splice(i, 1);
});
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register("sw.js");

// Exposed for play-testing from the browser console.
Object.assign(window, { game: { walkTo, cast, toggleRide, travel, swap, dragons, wizard, data, get area() { return area; }, get mode() { return mode; }, get currentArea() { return currentArea; }, camera } });
