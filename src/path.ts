import { Vector3 } from "./babylon";
import { MAP_RADIUS } from "./map";
import type { Obstacle } from "./world";

// Grid A* around trees, pools and pillars, so a far tap finds a way around clusters instead of stopping at them.

const CELL = 0.75;
const HALF = MAP_RADIUS + 2; // the grid covers the whole map on both axes
const SIZE = Math.ceil((HALF * 2) / CELL);

export class PathGrid {
  private blocked = new Uint8Array(SIZE * SIZE);

  // offLimits: ground he can't go onto at all, like a world that's still locked.
  constructor(obstacles: Obstacle[], pad: number, offLimits: (x: number, z: number) => boolean) {
    for (let cz = 0; cz < SIZE; cz++)
      for (let cx = 0; cx < SIZE; cx++) {
        const [wx, wz] = this.world(cx, cz);
        if (offLimits(wx, wz)) this.blocked[cz * SIZE + cx] = 1;
      }
    for (const o of obstacles) {
      const r = o.radius + pad;
      const [x0, z0] = this.cell(o.x - r, o.z - r);
      const [x1, z1] = this.cell(o.x + r, o.z + r);
      for (let cz = Math.max(0, z0); cz <= Math.min(SIZE - 1, z1); cz++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(SIZE - 1, x1); cx++) {
          const [wx, wz] = this.world(cx, cz);
          if (Math.hypot(wx - o.x, wz - o.z) < r) this.blocked[cz * SIZE + cx] = 1;
        }
      }
    }
  }

  private cell(x: number, z: number): [number, number] {
    return [Math.floor((x + HALF) / CELL), Math.floor((z + HALF) / CELL)];
  }

  private world(cx: number, cz: number): [number, number] {
    return [cx * CELL - HALF + CELL / 2, cz * CELL - HALF + CELL / 2];
  }

  private free(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < SIZE && cz < SIZE && !this.blocked[cz * SIZE + cx];
  }

  // The free cell nearest a point, searching outward ring by ring.
  private nearestFree(cx: number, cz: number): [number, number] | null {
    for (let r = 0; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.free(cx + dx, cz + dz)) return [cx + dx, cz + dz];
        }
      }
    }
    return null;
  }

  private clearLine(a: Vector3, b: Vector3): boolean {
    const steps = Math.ceil(Vector3.Distance(a, b) / (CELL / 3));
    for (let i = 1; i < steps; i++) {
      const [cx, cz] = this.cell(a.x + ((b.x - a.x) * i) / steps, a.z + ((b.z - a.z) * i) / steps);
      if (!this.free(cx, cz)) return false;
    }
    return true;
  }

  // Waypoints from `from` to (as near as possible) `to`, or null if there is no way.
  find(from: Vector3, to: Vector3): Vector3[] | null {
    const start = this.nearestFree(...this.cell(from.x, from.z));
    const goal = this.nearestFree(...this.cell(to.x, to.z));
    if (!start || !goal) return null;
    const startId = start[1] * SIZE + start[0];
    const goalId = goal[1] * SIZE + goal[0];
    const g = new Float32Array(SIZE * SIZE).fill(Infinity);
    const came = new Int32Array(SIZE * SIZE).fill(-1);
    const closed = new Uint8Array(SIZE * SIZE);
    const h = (id: number) => {
      const dx = Math.abs((id % SIZE) - goal[0]);
      const dz = Math.abs(Math.floor(id / SIZE) - goal[1]);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    const open = new Heap();
    g[startId] = 0;
    open.push(startId, h(startId));
    while (open.size) {
      const id = open.pop();
      if (id === goalId) break;
      if (closed[id]) continue;
      closed[id] = 1;
      const cx = id % SIZE;
      const cz = Math.floor(id / SIZE);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.free(nx, nz)) continue;
          if (dx && dz && (!this.free(cx + dx, cz) || !this.free(cx, cz + dz))) continue; // no cutting corners
          const nid = nz * SIZE + nx;
          const cost = g[id] + (dx && dz ? Math.SQRT2 : 1);
          if (cost < g[nid]) {
            g[nid] = cost;
            came[nid] = id;
            open.push(nid, cost + h(nid));
          }
        }
      }
    }
    if (came[goalId] === -1 && goalId !== startId) return null;

    const cells: Vector3[] = [];
    for (let id = goalId; id !== -1; id = came[id]) {
      const [x, z] = this.world(id % SIZE, Math.floor(id / SIZE));
      cells.push(new Vector3(x, 0, z));
      if (id === startId) break;
    }
    cells.reverse();
    cells[cells.length - 1] = this.free(...this.cell(to.x, to.z)) ? new Vector3(to.x, 0, to.z) : cells[cells.length - 1];

    // Keep only the corners: skip ahead to the farthest waypoint in a straight, clear line.
    const path: Vector3[] = [];
    let at = new Vector3(from.x, 0, from.z);
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.clearLine(at, cells[j])) j--;
      path.push(cells[j]);
      at = cells[j];
      i = j + 1;
    }
    return path;
  }
}

class Heap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size() {
    return this.ids.length;
  }

  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
