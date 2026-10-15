import type { SoundButton, Track } from '../types/soundboard';

// Per button: URIs not yet played in the current round. Every song plays once before any repeats.
const bags = new Map<string, string[]>();
const lastPlayed = new Map<string, string>();

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function pickTrack(button: SoundButton): Track | null {
  const byUri = new Map(button.tracks.map((t) => [t.uri, t]));
  if (byUri.size === 0) return null;

  // Drop songs removed in the editor since the bag was filled.
  let bag = (bags.get(button.id) ?? []).filter((uri) => byUri.has(uri));
  if (bag.length === 0) {
    bag = shuffle([...byUri.keys()]);
    // Never the same song twice in a row across a round boundary.
    if (bag.length > 1 && bag.at(-1) === lastPlayed.get(button.id)) [bag[0], bag[bag.length - 1]] = [bag.at(-1)!, bag[0]];
  }
  const uri = bag.pop()!;
  bags.set(button.id, bag);
  lastPlayed.set(button.id, uri);
  return byUri.get(uri)!;
}
