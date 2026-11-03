import type { Spell } from "./characters";
import type { Look } from "./save";

// The HTML overlay. Everything is icons, no words, because he may not read yet.

export const ROBES = ["#29459e", "#a32d2d", "#2f7a3b", "#5b3a9e", "#2c2c2a", "#c9962b"];
export const CRYSTALS = ["#66e6ff", "#ff7ad9", "#7dff8a", "#ffb340"];

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let bannerTimer = 0;
let rideShown: string | null = null;

// Buttons answer on touch-down, so they feel instant, and don't also count as a tap on the world.
function press(el: Element, cb: () => void) {
  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    cb();
  });
}

export const ui = {
  onStart(cb: () => void) {
    press($("play"), () => {
      $("start").classList.add("hidden");
      cb();
    });
  },
  onSpell(cb: (spell: Spell) => void) {
    document.querySelectorAll<HTMLButtonElement>("[data-spell]").forEach((b) => press(b, () => cb(b.dataset.spell as Spell)));
  },
  onRun: (cb: () => void) => press($("run"), cb),
  onRide: (cb: () => void) => press($("ride"), cb),
  onMute: (cb: () => void) => press($("mute"), cb),

  // The look picker: robe swatches, crystal swatches, staff, hood or hat, and his name.
  onWardrobe(look: Look, name: string, open: () => void, change: (look: Look, name: string) => void, done: () => void) {
    const render = () => {
      $("robes").innerHTML = ROBES.map((c) => `<button class="swatch${c === look.robe ? " on" : ""}" data-robe="${c}" style="background:${c}"></button>`).join("");
      $("crystals").innerHTML = CRYSTALS.map((c) => `<button class="swatch${c === look.crystal ? " on" : ""}" data-crystal="${c}" style="background:${c}"></button>`).join("");
      document.querySelectorAll(".hatPick").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.hat === look.hat));
      document.querySelectorAll(".staffPick").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.staff === look.staff));
      document.querySelectorAll<HTMLElement>("[data-robe]").forEach((b) => press(b, () => pick({ robe: b.dataset.robe! })));
      document.querySelectorAll<HTMLElement>("[data-crystal]").forEach((b) => press(b, () => pick({ crystal: b.dataset.crystal! })));
    };
    const pick = (part: Partial<Look>) => {
      Object.assign(look, part);
      change(look, input.value.trim());
      render();
    };
    const input = $("name") as HTMLInputElement;
    input.value = name;
    input.addEventListener("input", () => change(look, input.value.trim()));
    input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
    document.querySelectorAll<HTMLElement>(".hatPick").forEach((b) => press(b, () => pick({ hat: b.dataset.hat as Look["hat"] })));
    document.querySelectorAll<HTMLElement>(".staffPick").forEach((b) => press(b, () => pick({ staff: b.dataset.staff as Look["staff"] })));
    press($("dress"), () => {
      $("start").classList.add("hidden");
      $("wardrobe").classList.remove("hidden");
      render();
      open();
    });
    press($("dressDone"), () => {
      input.blur();
      $("wardrobe").classList.add("hidden");
      $("start").classList.remove("hidden");
      done();
    });
  },

  battle(on: boolean) {
    for (const id of ["spells", "grump", "run"]) $(id).classList.toggle("hidden", !on);
  },
  ride(state: "hidden" | "mount" | "land") {
    if (state === rideShown) return;
    rideShown = state;
    $("ride").classList.toggle("hidden", state === "hidden");
    $("ride").querySelector("small")!.textContent = state === "land" ? "⬇" : "⬆";
  },
  grump(fraction: number, color = "#e24b4a") {
    $("grumpFill").style.width = `${Math.round(fraction * 100)}%`;
    $("grumpFill").style.background = color;
  },
  title(name: string) {
    $("start").querySelector("h1")!.textContent = name ? `Wizard ${name}` : "Wizard and Dragons";
  },
  hearts(n: number) {
    $("hearts").textContent = "❤️".repeat(n) + "🤍".repeat(3 - n);
  },
  friends(n: number, total: number) {
    $("friends").innerHTML = Array.from({ length: total }, (_, i) => `<span class="${i < n ? "got" : ""}">🐉</span>`).join("");
  },
  stars(n: number) {
    $("stars").textContent = `⭐ ${n}`;
  },
  muted(on: boolean) {
    $("mute").textContent = on ? "🔇" : "🔊";
  },
  cooldown(seconds: number) {
    $("spells").classList.add("cooling");
    setTimeout(() => $("spells").classList.remove("cooling"), seconds * 1000);
  },
  fade(on: boolean) {
    $("fade").classList.toggle("on", on);
  },
  banner(text: string, seconds: number) {
    const b = $("banner");
    b.textContent = text;
    b.classList.remove("hidden");
    b.style.animation = "none";
    void b.offsetWidth;
    b.style.animation = "";
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => b.classList.add("hidden"), seconds * 1000);
  },
};
