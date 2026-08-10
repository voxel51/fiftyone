/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { formatChord, tryParseChord } from "./chords";
import type { ResolvedBinding } from "./overrides";
import { isAncestorScope } from "./scopes";

/**
 * Doc §4.7 defines these precisely, because a pane that calls everything a
 * conflict will cry wolf and get ignored:
 *
 *  - `conflict` — same chord, **same** scope. Genuinely broken; CI can fail on
 *    these once the manifest is static.
 *  - `shadows-ancestor` — this binding takes a chord an *ancestor* scope also
 *    uses, making the ancestor's command unreachable while this scope is
 *    active. Usually intentional, always surprising, so it gets its own
 *    affordance rather than being lumped in with either of the others.
 *  - `shadows` — same chord in an unrelated scope. Legal and expected; Blender
 *    treats this as normal and so do we. Information, not a warning.
 */
export type OverlapKind =
  "conflict" | "shadows-ancestor" | "shadowed-by-descendant" | "shadows";

export interface Overlap {
  kind: OverlapKind;
  chord: string;
  /** The other command sharing the chord. */
  otherId: string;
  otherLabel: string;
  otherScope: string;
}

export type OverlapMap = ReadonlyMap<string, readonly Overlap[]>;

export const analyzeOverlaps = (
  bindings: readonly ResolvedBinding[],
): OverlapMap => {
  // chord → the bindings claiming it
  const byChord = new Map<string, ResolvedBinding[]>();
  for (const binding of bindings) {
    for (const key of binding.keys) {
      const chord = tryParseChord(key);
      if (!chord) {
        continue;
      }
      const normalized = formatChord(chord);
      const existing = byChord.get(normalized) ?? [];
      existing.push(binding);
      byChord.set(normalized, existing);
    }
  }

  const result = new Map<string, Overlap[]>();
  const add = (id: string, overlap: Overlap) => {
    const existing = result.get(id) ?? [];
    existing.push(overlap);
    result.set(id, existing);
  };

  for (const [chord, claimants] of byChord) {
    if (claimants.length < 2) {
      continue;
    }
    for (const a of claimants) {
      for (const b of claimants) {
        if (a.entry.id === b.entry.id) {
          continue;
        }
        let kind: OverlapKind;
        if (a.entry.scope === b.entry.scope) {
          kind = "conflict";
        } else if (isAncestorScope(b.entry.scope, a.entry.scope)) {
          kind = "shadows-ancestor";
        } else if (isAncestorScope(a.entry.scope, b.entry.scope)) {
          kind = "shadowed-by-descendant";
        } else {
          kind = "shadows";
        }
        add(a.entry.id, {
          kind,
          chord,
          otherId: b.entry.id,
          otherLabel: b.entry.label,
          otherScope: b.entry.scope,
        });
      }
    }
  }

  return result;
};

/** The subset that is actually broken — what CI would fail on. */
export const trueConflicts = (overlaps: OverlapMap): Overlap[] =>
  [...overlaps.values()]
    .flat()
    .filter((overlap) => overlap.kind === "conflict");

export const worstKind = (
  overlaps: readonly Overlap[] | undefined,
): OverlapKind | null => {
  if (!overlaps?.length) {
    return null;
  }
  if (overlaps.some((overlap) => overlap.kind === "conflict")) {
    return "conflict";
  }
  if (overlaps.some((overlap) => overlap.kind === "shadows-ancestor")) {
    return "shadows-ancestor";
  }
  if (overlaps.some((overlap) => overlap.kind === "shadowed-by-descendant")) {
    return "shadowed-by-descendant";
  }
  return "shadows";
};
