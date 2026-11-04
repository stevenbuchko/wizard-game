// Progress lives in the iPad's local storage. The home-screen app keeps its own storage, separate from Safari's.

export interface Look {
  robe: string;
  crystal: string;
  hat: "hat" | "hood";
  staff: "wood" | "gold" | "shard";
}

export interface SaveData {
  friends: string[]; // dragon ids, in the order he befriended them
  stars: string[];
  look: Look;
  muted: boolean;
  name: string; // shown on the title screen
  following: string[]; // the friends he chose to walk with him, oldest choice first; the rest wait at home
}

export const MAX_FOLLOWERS = 3;

const KEY = "wizard-game-v1";

function defaults(): SaveData {
  return { friends: [], stars: [], look: { robe: "#29459e", crystal: "#66e6ff", hat: "hood", staff: "wood" }, muted: false, name: "", following: [] };
}

export function load(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const saved = JSON.parse(raw) as Partial<SaveData>;
    const friends = saved.friends ?? [];
    // A save from before he could choose keeps the most recent friends walking with him.
    const following = (saved.following ?? friends.slice(-MAX_FOLLOWERS)).filter((id) => friends.includes(id));
    return { ...d, ...saved, look: { ...d.look, ...saved.look }, following };
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
