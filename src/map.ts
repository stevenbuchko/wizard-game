import { Vector3 } from "./babylon";
import { AREAS, type AreaId } from "./areas";

// One big world: the dragon home is a round meadow in the middle, and each world is a slice of the ring around it,
// with a line on the ground between every two of them.

export const HOME_RADIUS = 34;
export const EDGE = 10; // how far inside its line the home blends into the world beside it
export const MAP_RADIUS = 118; // how far out he can walk or fly
const MIDDLE = (HOME_RADIUS + MAP_RADIUS) / 2; // where a world's own (0, 0) lands

export const WORLDS = (Object.keys(AREAS) as AreaId[]).filter((id) => id !== "home");

const rad = (id: AreaId) => (AREAS[id].at * Math.PI) / 180;

// The way out from the middle into a world, and his right hand when he faces that way.
function axes(id: AreaId): { out: Vector3; right: Vector3 } {
  const a = rad(id);
  const out = new Vector3(Math.sin(a), 0, Math.cos(a));
  return { out, right: new Vector3(out.z, 0, -out.x) };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function worldAt(x: number, z: number): AreaId {
  const a = Math.atan2(x, z);
  return WORLDS.reduce((best, id) => (Math.abs(wrap(a - rad(id))) < Math.abs(wrap(a - rad(best))) ? id : best));
}

export function regionAt(x: number, z: number): AreaId {
  return Math.hypot(x, z) < HOME_RADIUS ? "home" : worldAt(x, z);
}

// Inside the home's edge, each spot is the home's or the world beside it by chance, more often the world's nearer its line,
// so the world's trees and grass run in a little way and thin out.
export function ownerAt(x: number, z: number, roll: number): AreaId {
  const r = Math.hypot(x, z);
  if (r >= HOME_RADIUS) return worldAt(x, z);
  if (r < HOME_RADIUS - EDGE) return "home";
  return roll < (HOME_RADIUS - r) / EDGE ? "home" : worldAt(x, z);
}

// A world's slice of the ring, as angles measured from +z toward +x: halfway to each neighbour.
export function sliceOf(id: AreaId): [number, number] {
  const a = rad(id);
  let left = Math.PI;
  let right = Math.PI;
  for (const other of WORLDS) {
    if (other === id) continue;
    const d = wrap(rad(other) - a);
    if (d > 0) right = Math.min(right, d);
    else left = Math.min(left, -d);
  }
  return [a - left / 2, a + right / 2];
}

// The lines between neighbouring worlds, as angles.
export function spokes(): number[] {
  return WORLDS.map((id) => sliceOf(id)[1]);
}

// Spots in each world's data are its own: [0, 0] mid-world, -z toward the middle, as when every world had its own map.
export function toMap(id: AreaId, x: number, z: number): Vector3 {
  if (id === "home") return new Vector3(x, 0, z);
  const { out, right } = axes(id);
  return out.scale(MIDDLE + z).addInPlace(right.scale(x));
}

// Where a nap leaves him, and the start: just inside the world's line, facing out into it.
export function spawnOf(id: AreaId): { at: Vector3; yaw: number } {
  if (id === "home") return { at: Vector3.Zero(), yaw: 0 };
  const { out } = axes(id);
  return { at: out.scale(HOME_RADIUS + 5), yaw: rad(id) };
}

// Where a world's line with the home is, for its sign.
export function gateOf(id: AreaId): Vector3 {
  return axes(id).out.scale(HOME_RADIUS);
}
