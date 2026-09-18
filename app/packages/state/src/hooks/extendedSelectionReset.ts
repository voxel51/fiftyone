import type { ReverbState } from "@fiftyone/reverb";

/**
 * The set/reset surface a participant receives — the SAME transaction
 * {@link ./useResetExtendedSelection} resets the core selection atoms in, so
 * a participant's writes land in one commit with them. Atoms are untyped
 * here: participants own atoms this package has never heard of.
 */
export interface ExtendedSelectionResetInterface {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (state: ReverbState<any>, value: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reset: (state: ReverbState<any>) => void;
}

export type ExtendedSelectionResetParticipant = (
  cb: ExtendedSelectionResetInterface,
) => void;

const participants = new Set<ExtendedSelectionResetParticipant>();

/**
 * Registers a callback to join every extended-selection reset. Extensions
 * that publish selection artifacts of their own (atoms this package does not
 * know) register one so "clear the selection" clears them in the same
 * transaction. Returns the unregister, for HMR disposal.
 */
export function registerExtendedSelectionResetParticipant(
  participant: ExtendedSelectionResetParticipant,
): () => void {
  participants.add(participant);
  return () => {
    participants.delete(participant);
  };
}

/** Invokes every registered participant with the caller's transaction. */
export function runExtendedSelectionResetParticipants(
  cb: ExtendedSelectionResetInterface,
): void {
  for (const participant of participants) participant(cb);
}
