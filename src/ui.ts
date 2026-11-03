import type { Spell } from "./characters";

// The HTML overlay. Everything is icons, no words, because he may not read yet.

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let bannerTimer = 0;

export const ui = {
  onStart(cb: () => void) {
    $("start").querySelector("button")!.addEventListener("pointerdown", () => {
      $("start").classList.add("hidden");
      cb();
    });
  },
  onSpell(cb: (spell: Spell) => void) {
    document.querySelectorAll<HTMLButtonElement>("[data-spell]").forEach((b) =>
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        cb(b.dataset.spell as Spell);
      }),
    );
  },
  onRun(cb: () => void) {
    $("run").addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      cb();
    });
  },
  battle(on: boolean) {
    for (const id of ["spells", "grump", "run"]) $(id).classList.toggle("hidden", !on);
  },
  grump(fraction: number) {
    $("grumpFill").style.width = `${Math.round(fraction * 100)}%`;
  },
  hearts(n: number) {
    $("hearts").textContent = "❤️".repeat(n) + "🤍".repeat(3 - n);
  },
  friends(n: number, total: number) {
    $("friends").innerHTML = Array.from({ length: total }, (_, i) => `<span class="${i < n ? "got" : ""}">🐉</span>`).join("");
  },
  cooldown(seconds: number) {
    $("spells").classList.add("cooling");
    setTimeout(() => $("spells").classList.remove("cooling"), seconds * 1000);
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
