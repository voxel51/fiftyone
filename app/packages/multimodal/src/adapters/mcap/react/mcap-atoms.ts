import { atom } from "jotai";

/**
 * Read/written with the playback store (`useAtomValue(atom, { store })`),
 * so each MultiModalPlayback instance gets an isolated value rather than
 * sharing one global atom value.
 */
export const mcapDataStreamAtom = atom<{
  subscribeToTopic: (topic: string) => () => void;
} | null>(null);
