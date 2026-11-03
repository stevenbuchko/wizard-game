// Progress lives in the iPad's local storage. The home-screen app keeps its own storage, separate from Safari's.

export interface Look {
  robe: string;
  crystal: string;
  hat: "hat" | "hood";
}

export interface SaveData {
  friends: string[]; // dragon ids, in the order he befriended them
  stars: string[];
  look: Look;
  muted: boolean;
}

const KEY = "wizard-game-v1";

function defaults(): SaveData {
  return { friends: [], stars: [], look: { robe: "#29459e", crystal: "#66e6ff", hat: "hood" }, muted: false };
}

export function load(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const saved = JSON.parse(raw) as Partial<SaveData>;
    return { ...d, ...saved, look: { ...d.look, ...saved.look } };
  } catch {
    return d;
  }
}

export function save(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private browsing or full storage: the game still plays, it just won't remember.
  }
}
