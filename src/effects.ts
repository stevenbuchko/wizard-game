import { AbstractMesh, Color3, Color4, DynamicTexture, MeshBuilder, ParticleSystem, Scene, StandardMaterial, Vector3 } from "./babylon";
import type { Spell } from "./characters";

export type Sparkle = Spell | "gold";

const PALETTE: Record<Sparkle, [Color4, Color4, Vector3]> = {
  fire: [new Color4(1, 0.85, 0.2, 1), new Color4(1, 0.3, 0.05, 1), new Vector3(0, 4, 0)],
  ice: [new Color4(1, 1, 1, 1), new Color4(0.5, 0.8, 1, 1), new Vector3(0, -3, 0)],
  lightning: [new Color4(1, 1, 0.7, 1), new Color4(1, 0.85, 0.1, 1), new Vector3(0, 0, 0)],
  shield: [new Color4(0.9, 0.8, 1, 1), new Color4(0.6, 0.4, 1, 1), new Vector3(0, 1, 0)],
  gold: [new Color4(1, 0.95, 0.6, 1), new Color4(1, 0.7, 0.2, 1), new Vector3(0, -2, 0)],
};

let texture: DynamicTexture | null = null;

// A soft white dot, drawn once, that every particle uses.
function dot(scene: Scene): DynamicTexture {
  if (texture) return texture;
  texture = new DynamicTexture("dot", 64, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

function system(scene: Scene, kind: Sparkle, capacity: number): ParticleSystem {
  const [c1, c2, gravity] = PALETTE[kind];
  const ps = new ParticleSystem("p", capacity, scene);
  ps.particleTexture = dot(scene);
  ps.color1 = c1;
  ps.color2 = c2;
  ps.colorDead = new Color4(c2.r, c2.g, c2.b, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_ONEONE;
  ps.gravity = gravity;
  return ps;
}

// A stream of particles behind a moving spell. Call the returned function when it lands.
export function trail(scene: Scene, emitter: AbstractMesh, kind: Sparkle): () => void {
  const ps = system(scene, kind, 400);
  ps.emitter = emitter;
  ps.createSphereEmitter(0.25);
  ps.emitRate = 260;
  ps.minLifeTime = 0.15;
  ps.maxLifeTime = 0.4;
  ps.minSize = 0.15;
  ps.maxSize = 0.5;
  ps.minEmitPower = 0.2;
  ps.maxEmitPower = 0.8;
  ps.start();
  return () => {
    ps.stop();
    setTimeout(() => ps.dispose(), 600);
  };
}

export function burst(scene: Scene, at: Vector3, kind: Sparkle, count: number) {
  const ps = system(scene, kind, count);
  ps.emitter = at.clone();
  ps.createSphereEmitter(0.3);
  ps.manualEmitCount = count;
  ps.minLifeTime = 0.4;
  ps.maxLifeTime = 1;
  ps.minSize = 0.2;
  ps.maxSize = 0.6;
  ps.minEmitPower = 3;
  ps.maxEmitPower = 8;
  ps.targetStopDuration = 1.2;
  ps.disposeOnStop = true;
  ps.start();
}

// A jagged bolt that flickers for a quarter second.
export function bolt(scene: Scene, from: Vector3, to: Vector3) {
  const mat = new StandardMaterial("bolt", scene);
  mat.emissiveColor = new Color3(1, 1, 0.75);
  mat.disableLighting = true;
  const meshes = [0, 1].map((branch) => {
    const path: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = Vector3.Lerp(from, to, i / 8);
      if (i > 0 && i < 8) p.addInPlace(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).scale(branch ? 1.4 : 0.8));
      path.push(p);
    }
    const tube = MeshBuilder.CreateTube("bolt", { path, radius: branch ? 0.03 : 0.07, tessellation: 5 }, scene);
    tube.material = mat;
    tube.isPickable = false;
    return tube;
  });
  let flicks = 0;
  const timer = setInterval(() => {
    meshes.forEach((m) => (m.isVisible = !m.isVisible));
    if (++flicks > 4) {
      clearInterval(timer);
      meshes.forEach((m) => m.dispose());
      mat.dispose();
    }
  }, 50);
}
