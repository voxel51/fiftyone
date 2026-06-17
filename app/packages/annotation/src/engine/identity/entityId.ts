/**
 * EntityId — the canonical string form of a {@link LabelRef}, used ONLY at
 * string boundaries (signal-pipe topic keys, URLs, cross-process).
 *
 * Format: `v1:<dataset>:<sample>:<path>:<instanceId>[:<frame>]`, segments
 * escaped so the format can carry arbitrary values and evolve in one place.
 * Decode raises on malformed input (client error, never a silent fallback).
 */

import type { LabelRef } from "./ref";

/** Opaque, versioned string form of a label identity. */
export type EntityId = string;

const VERSION = "v1";

/** A decoded entity identity: the ambient dataset plus the canonical ref. */
export interface EntityIdentity {
  dataset: string;
  ref: LabelRef;
}

export class MalformedEntityIdError extends Error {
  constructor(id: string, reason: string) {
    super(`malformed EntityId "${id}": ${reason}`);
    this.name = "MalformedEntityIdError";
  }
}

const escapeSegment = (segment: string): string =>
  segment.replace(/\\/g, "\\\\").replace(/:/g, "\\:");

/** Split on unescaped `:`, then unescape each segment. */
const splitSegments = (id: string): string[] => {
  const segments: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of id) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === ":") {
      segments.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  segments.push(current);
  return segments;
};

/** Encode a label identity into its canonical `EntityId` string. */
export const encodeEntityId = (dataset: string, ref: LabelRef): EntityId => {
  const segments = [
    VERSION,
    escapeSegment(dataset),
    escapeSegment(ref.sample),
    escapeSegment(ref.path),
    escapeSegment(ref.instanceId),
  ];

  if (ref.frame !== undefined) {
    segments.push(String(ref.frame));
  }

  return segments.join(":");
};

/** Decode an `EntityId`. Throws {@link MalformedEntityIdError} on bad input. */
export const decodeEntityId = (id: EntityId): EntityIdentity => {
  const segments = splitSegments(id);

  if (segments[0] !== VERSION) {
    throw new MalformedEntityIdError(id, `unknown version "${segments[0]}"`);
  }

  if (segments.length < 5 || segments.length > 6) {
    throw new MalformedEntityIdError(
      id,
      `expected 5 or 6 segments, got ${segments.length}`
    );
  }

  const [, dataset, sample, path, instanceId, frameSegment] = segments;

  if (!dataset || !sample || !path || !instanceId) {
    throw new MalformedEntityIdError(id, "empty identity segment");
  }

  let frame: number | undefined;

  if (frameSegment !== undefined) {
    frame = Number(frameSegment);

    if (!Number.isInteger(frame) || frameSegment === "") {
      throw new MalformedEntityIdError(id, `bad frame "${frameSegment}"`);
    }
  }

  return { dataset, ref: { sample, path, instanceId, frame } };
};
