import {
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
} from "@babylonjs/core";
import { makeDragon, makeWizard, SPELL_COLORS, type Dragon, type DragonSpec, type Spell } from "./characters";
import { makeWorld, WORLD_RADIUS } from "./world";
import { sfx, unlockAudio } from "./audio";
import { ui } from "./ui";

const WALK_SPEED = 5;
const FACE_OFF_DISTANCE = 7;
const STRONG_HIT = 34; // three strong spells befriend a dragon
const WEAK_HIT = 8;
const SPELL_COOLDOWN = 0.7;
const SHIELD_TIME = 2.5;
const HEARTS = 3;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true });
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 1.5));
const scene = new Scene(engine);

const SPAWN = Vector3.Zero();
const DRAGONS: DragonSpec[] = [
  { name: "bronze", color: new Color3(0.72, 0.3, 0.16), belly: new Color3(0.9, 0.7, 0.45), element: "fire", weakTo: "ice", home: new Vector3(0, 0, 24) },
  { name: "frost", color: new Color3(0.62, 0.78, 0.9), belly: new Color3(0.92, 0.95, 1), element: "ice", weakTo: "lightning", home: new Vector3(-26, 0, -10) },
  { name: "storm", color: new Color3(0.3, 0.45, 0.28), belly: new Color3(0.75, 0.8, 0.5), element: "lightning", weakTo: "fire", home: new Vector3(24, 0, -16) },
];

const { ground, shadows } = makeWorld(scene, DRAGONS.map((d) => d.home));
new GlowLayer("glow", scene).intensity = 0.6;

const wizard = makeWizard(scene);
wizard.meshes.forEach((m) => shadows.addShadowCaster(m));
const dragons = DRAGONS.map((spec) => makeDragon(scene, spec));
for (const d of dragons) {
  d.meshes.forEach((m) => shadows.addShadowCaster(m));
  d.root.rotation.y = yawTo(d.root.position, SPAWN);
}

const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1.05, 14, new Vector3(0, 1.5, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 9;
camera.upperRadiusLimit = 26;
camera.lowerBetaLimit = 0.45;
camera.upperBetaLimit = 1.35;
camera.panningSensibility = 0;
camera.angularSensibilityX = 600;
camera.angularSensibilityY = 600;

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

type Mode = "title" | "explore" | "battle" | "nap";
let mode: Mode = "title";
let now = 0;
let walkTarget: Vector3 | null = null;
let walkPhase = 0;
let wobble = 0;
let foe: Dragon | null = null;
let hearts = HEARTS;
let shieldUntil = 0;
let cooldownUntil = 0;
let nextPuffAt = 0;
let windup = false;
let battleCamUntil = 0;

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

function flatDistance(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function headOf(d: Dragon): Vector3 {
  return d.head.getAbsolutePosition().clone();
}

function wizardChest(): Vector3 {
  return wizard.root.position.add(new Vector3(0, 1.3, 0));
}

function orb(from: Vector3, to: () => Vector3, color: Color3, duration: number, onArrive: () => void) {
  const m = MeshBuilder.CreateSphere("orb", { diameter: 0.55, segments: 8 }, scene);
  m.material = glowMaterial(color);
  m.isPickable = false;
  let t = 0;
  effects.push((dt) => {
    t = Math.min(1, t + dt / duration);
    Vector3.LerpToRef(from, to(), t, m.position);
    m.position.y += Math.sin(t * Math.PI) * 1.2;
    if (t < 1) return true;
    m.dispose();
    onArrive();
    return false;
  });
}

function burst(at: Vector3, color: Color3, count: number) {
  const mat = glowMaterial(color);
  for (let i = 0; i < count; i++) {
    const m = MeshBuilder.CreateSphere("spark", { diameter: 0.25, segments: 4 }, scene);
    m.material = mat;
    m.isPickable = false;
    m.position.copyFrom(at);
    const v = new Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).scale(8);
    let life = 0.7;
    effects.push((dt) => {
      life -= dt;
      v.y -= 9 * dt;
      m.position.addInPlace(v.scale(dt));
      m.scaling.setAll(Math.max(0.01, life / 0.7));
      if (life > 0) return true;
      m.dispose();
      return false;
    });
  }
}

function walkTo(point: Vector3) {
  const p = point.clone();
  p.y = 0;
  if (p.length() > WORLD_RADIUS) p.normalize().scaleInPlace(WORLD_RADIUS);
  walkTarget = p;
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
  battleCamUntil = now + 1.2;
  ui.grump(d.grump / 100);
  ui.battle(true);
  sfx.growl();
}

function endBattle() {
  foe = null;
  windup = false;
  ui.battle(false);
}

function cast(spell: Spell) {
  if (mode !== "battle" || !foe || now < cooldownUntil) return;
  cooldownUntil = now + SPELL_COOLDOWN;
  ui.cooldown(SPELL_COOLDOWN);
  sfx[spell]();
  if (spell === "shield") {
    shieldUntil = now + SHIELD_TIME;
    return;
  }
  const target = foe;
  orb(wizard.crystal.getAbsolutePosition().clone(), () => headOf(target), SPELL_COLORS[spell], 0.45, () => {
    if (foe !== target) return;
    const strong = spell === target.weakTo;
    target.grump = Math.max(0, target.grump - (strong ? STRONG_HIT : WEAK_HIT));
    target.flinch = strong ? 1 : 0.3;
    burst(headOf(target), SPELL_COLORS[spell], strong ? 18 : 6);
    if (strong) sfx.strong();
    else sfx.weak();
    ui.grump(target.grump / 100);
    if (target.grump === 0) befriend(target);
  });
}

function befriend(d: Dragon) {
  d.friend = true;
  d.skin.emissiveColor = d.skin.diffuseColor.scale(0.2);
  endBattle();
  mode = "explore";
  sfx.friend();
  burst(headOf(d), new Color3(1, 0.85, 0.3), 40);
  const count = dragons.filter((x) => x.friend).length;
  ui.friends(count, dragons.length);
  ui.banner(count === dragons.length ? "🎉🐉🎉" : "🐉💛", 2.5);
}

function dragonPuff(d: Dragon) {
  orb(headOf(d), wizardChest, SPELL_COLORS[d.element], 0.8, () => {
    if (foe !== d) return;
    if (now < shieldUntil) {
      sfx.block();
      burst(wizardChest(), SPELL_COLORS.shield, 10);
      return;
    }
    hearts--;
    wobble = 1;
    ui.hearts(hearts);
    sfx.hurt();
    if (hearts <= 0) nap(d);
  });
}

// Losing is a nap, never a game over: back to the start, hearts refilled.
function nap(d: Dragon) {
  endBattle();
  mode = "nap";
  ui.banner("💤", 2);
  setTimeout(() => {
    wizard.root.position.copyFrom(SPAWN);
    d.grump = 100;
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

function updateWizard(dt: number) {
  const pos = wizard.root.position;
  let walking = false;
  if (walkTarget && mode === "explore") {
    const to = walkTarget.subtract(pos);
    to.y = 0;
    const dist = to.length();
    if (dist < 0.2) {
      walkTarget = null;
      marker.isVisible = false;
    } else {
      walking = true;
      pos.addInPlace(to.normalize().scale(Math.min(dist, WALK_SPEED * dt)));
      turnToward(wizard.root, walkTarget, dt, 10);
    }
  }
  if (foe) turnToward(wizard.root, foe.root.position, dt, 6);
  walkPhase += walking ? dt * 12 : 0;
  wizard.body.position.y = walking ? Math.abs(Math.sin(walkPhase)) * 0.12 : 0;
  wobble = Math.max(0, wobble - dt * 1.5);
  wizard.body.rotation.z = Math.sin(now * 30) * 0.25 * wobble;
  shieldBubble.isVisible = now < shieldUntil;
  marker.scaling.setAll(1 + Math.sin(now * 6) * 0.1);

  if (mode !== "explore") return;
  for (const d of dragons) {
    if (!d.friend && now > d.calmUntil && flatDistance(pos, d.root.position) < FACE_OFF_DISTANCE) {
      startBattle(d);
      return;
    }
  }
}

function updateDragons(dt: number) {
  const back = new Vector3(Math.sin(wizard.root.rotation.y), 0, Math.cos(wizard.root.rotation.y)).scale(-1);
  const side = new Vector3(back.z, 0, -back.x);
  let followers = 0;
  for (const d of dragons) {
    let moving = false;
    if (d.friend) {
      const goal = wizard.root.position.add(back.scale(6 + followers * 4)).add(side.scale(followers % 2 ? 3 : -3));
      followers++;
      const to = goal.subtract(d.root.position);
      to.y = 0;
      const dist = to.length();
      if (dist > 0.8) {
        moving = true;
        d.root.position.addInPlace(to.normalize().scale(Math.min(dist, Math.min(dist * 1.5, 8) * dt)));
        turnToward(d.root, goal, dt, 4);
      }
    } else if (d === foe) {
      turnToward(d.root, wizard.root.position, dt, 5);
    }
    d.phase += dt * (moving ? 7 : 1.6);
    const flap = 0.35 + Math.sin(d.phase) * (moving ? 0.5 : 0.25);
    d.wings[0].rotation.z = -flap;
    d.wings[1].rotation.z = flap;
    d.flinch = Math.max(0, d.flinch - dt * 2.5);
    d.root.rotation.z = Math.sin(now * 40) * 0.06 * d.flinch;
    const lookUp = d === foe && windup ? -0.5 : 0;
    d.head.rotation.x += (lookUp - d.head.rotation.x) * Math.min(1, dt * 8);
    d.head.position.y = d.headBaseY + Math.sin(d.phase * 0.5) * 0.06;
  }
}

function updateBattle() {
  if (mode !== "battle" || !foe) return;
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

function updateCamera(dt: number) {
  const goal =
    mode === "battle" && foe
      ? Vector3.Center(wizard.root.position, foe.root.position).add(new Vector3(0, 2.5, 0))
      : wizard.root.position.add(new Vector3(0, 1.5, 0));
  Vector3.LerpToRef(camera.target, goal, Math.min(1, dt * 4), camera.target);
  if (mode === "battle" && foe && now < battleCamUntil) {
    const behind = Math.atan2(wizard.root.position.z - foe.root.position.z, wizard.root.position.x - foe.root.position.x);
    camera.alpha = lerpAngle(camera.alpha, behind, dt * 4);
    camera.radius += (17 - camera.radius) * Math.min(1, dt * 3);
    camera.beta += (1.15 - camera.beta) * Math.min(1, dt * 3);
  }
}

// A quick touch that barely moves is a tap to walk; anything else turns or zooms the camera.
let down: { x: number; y: number; t: number } | null = null;
scene.onPointerObservable.add((info) => {
  const e = info.event as PointerEvent;
  if (info.type === PointerEventTypes.POINTERDOWN) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (info.type !== PointerEventTypes.POINTERUP || !down) return;
  const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.t < 400;
  down = null;
  if (!tap || mode !== "explore") return;
  const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === ground);
  if (pick?.hit && pick.pickedPoint) walkTo(pick.pickedPoint);
});

ui.onStart(() => {
  unlockAudio();
  mode = "explore";
  ui.banner("👆", 1.5);
});
ui.onSpell(cast);
ui.onRun(walkAway);
ui.hearts(hearts);
ui.friends(0, dragons.length);

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  now += dt;
  updateWizard(dt);
  updateDragons(dt);
  updateBattle();
  updateCamera(dt);
  for (let i = effects.length - 1; i >= 0; i--) if (!effects[i](dt)) effects.splice(i, 1);
});
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register("sw.js");

// Exposed for play-testing from the browser console.
Object.assign(window, { game: { walkTo, cast, dragons, wizard } });
