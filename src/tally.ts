import { AREAS, type AreaId } from "./areas";
import { DRAGONS } from "./dragons";

// How many dragons are left in a world: one dragon per dragon living there, each in its own colors, lit once it's a friend.
// Drawn on a plain canvas, so the same row stands at a world's line and sits in the screen corner.

export const TALLY_W = 512;
export const TALLY_H = 128;

const SLOT = 108;
const tinted = new Map<string, HTMLCanvasElement>();

// The dragon emoji is always green, so each one is painted over in its own body color, keeping the emoji's shading.
function dragonIn(color: string, strength = 0.75): HTMLCanvasElement {
  const key = `${color}/${strength}`;
  let c = tinted.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.font = "80px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🐉", 48, 52);
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = strength;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 96, 96);
  tinted.set(key, c);
  return c;
}

export function dragonsIn(area: AreaId) {
  return DRAGONS.filter((d) => d.area === area);
}

export function isDone(area: AreaId, friends: string[]) {
  return dragonsIn(area).every((d) => friends.includes(d.id));
}

export function drawTally(ctx: CanvasRenderingContext2D, area: AreaId, friends: string[]) {
  const living = dragonsIn(area);
  const done = isDone(area, friends);
  const width = living.length * SLOT + (done ? SLOT : 0) + 24;
  const left = (TALLY_W - width) / 2;
  ctx.clearRect(0, 0, TALLY_W, TALLY_H);
  // Dark and edged in the world's own line color, so it never reads as the white locked-line sign; gold once finished.
  ctx.fillStyle = done ? "#f2b92e" : "rgba(20,24,44,0.78)";
  ctx.strokeStyle = done ? "#fff6c8" : AREAS[area].lineColor;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(left, 8, width, 112, 56);
  ctx.fill();
  ctx.stroke();
  living.forEach((d, i) => {
    const got = friends.includes(d.id);
    // One still to find is a dim shadow, since canvas filters are patchy in Safari and a pale dragon like frost looks grey anyway.
    ctx.globalAlpha = got ? 1 : 0.6;
    ctx.drawImage(got ? dragonIn(d.color) : dragonIn("#5a5f80", 1), left + 12 + i * SLOT + 6, 16, 96, 96);
  });
  ctx.globalAlpha = 1;
  if (done) {
    ctx.font = "80px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⭐", left + 12 + living.length * SLOT + 54, 68);
  }
}
