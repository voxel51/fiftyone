import { atom, type Getter, type SetStateAction } from "jotai";
import { atomFamily } from "jotai-family";
import { foldWindow } from "../fold";
import {
  capturedScopeSources,
  isDefaultSelectionBuckets,
  isPersistentDomain,
  normalizeSelectionBuckets,
  selectionCaptureKey,
  selectionDomainDataset,
  selectionMemberKey,
  updateEpisodeSelection,
  type SelectionBucket,
} from "../model";
import type {
  EpisodeSelection,
  SelectionBoundary,
  SelectionCounts,
  SelectionMember,
} from "../types";

export interface CandidateState {
  readonly key: string;
  /** Exact counts for the whole scope, or null while resolving. */
  readonly counts: SelectionCounts | null;
  readonly unavailableTotal?: number;
  readonly unavailableGroups?: readonly EpisodeSelection[];
  /** Details for captured parents; null marks one outside the scope. */
  readonly candidates: ReadonlyMap<string, EpisodeSelection | null>;
  readonly error: string | null;
  readonly loading: boolean;
}

export const candidatesAtom = atomFamily((_datasetId: string) =>
  atom<CandidateState>({
    key: "",
    counts: null,
    candidates: new Map(),
    loading: true,
    error: null,
  }),
);

export type Captures = ReadonlyMap<string, EpisodeSelection>;

const STORAGE_PREFIX = "fiftyone:grid-selection:";
const BUCKETS_PREFIX = "fiftyone:grid-selection-buckets:";

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function preferences(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isGroup(value: unknown): value is EpisodeSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EpisodeSelection).episodeId === "string" &&
    Array.isArray((value as EpisodeSelection).members)
  );
}

/** Captures survive a reload of the same tab; malformed storage is ignored. */
function readCaptures(datasetId: string): Captures {
  try {
    const raw = storage()?.getItem(STORAGE_PREFIX + datasetId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.filter(isGroup).map((group) => [group.episodeId, group] as const),
    );
  } catch {
    return new Map();
  }
}

function writeCaptures(datasetId: string, value: Captures) {
  try {
    const key = STORAGE_PREFIX + datasetId;
    if (value.size)
      storage()?.setItem(
        key,
        JSON.stringify(
          [...value.values()].map(({ node: _node, ...capture }) => capture),
        ),
      );
    else storage()?.removeItem(key);
  } catch {
    /* Storage is a convenience; the in-memory selection is authoritative. */
  }
}

/**
 * Captures for one bucket in one domain, keyed by `selectionCaptureKey`; the
 * samples view mirrors them to session storage.
 */
export const selectionAtom = atomFamily((captureKey: string) => {
  const persistent = isPersistentDomain(captureKey);
  const base = atom<Captures>(
    persistent ? readCaptures(captureKey) : new Map(),
  );
  return atom(
    (get) => get(base),
    (get, set, update: SetStateAction<Captures>) => {
      const next = typeof update === "function" ? update(get(base)) : update;
      set(base, next);
      if (persistent) writeCaptures(captureKey, next);
    },
  );
});
export const boundaryAtom = atomFamily((_datasetId: string) =>
  atom<SelectionBoundary>({}),
);
export const scopeRevisionAtom = atomFamily((_datasetId: string) => atom(0));
/** In-flight selection captures; actions must not freeze an older selection. */
export const pendingCapturesAtom = atomFamily((_domainId: string) => atom(0));
/** Capture failures are visible to the tray even when the click came from a tile. */
export const captureErrorAtom = atomFamily((_domainId: string) =>
  atom<{ message: string | null }>({ message: null }),
);
/** How many extra captures each end of a folded strip has revealed, per bucket. */
export const foldRevealedAtom = atomFamily((_captureKey: string) => atom(0));

/* ---------------------------------------------------------------------------
 * Buckets
 * ------------------------------------------------------------------------- */

/** A bucket layout is a preference: it outlives the tab, per dataset. */
function readBuckets(datasetId: string): readonly SelectionBucket[] {
  try {
    const raw = preferences()?.getItem(BUCKETS_PREFIX + datasetId);
    return normalizeSelectionBuckets(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSelectionBuckets(null);
  }
}

function writeBuckets(datasetId: string, value: readonly SelectionBucket[]) {
  try {
    const key = BUCKETS_PREFIX + datasetId;
    if (isDefaultSelectionBuckets(value)) preferences()?.removeItem(key);
    else preferences()?.setItem(key, JSON.stringify(value));
  } catch {
    /* The layout still applies for this session when preferences cannot be saved. */
  }
}

/** The ordered bucket layout of a dataset; always at least one bucket. */
export const bucketsAtom = atomFamily((datasetId: string) => {
  const base = atom<readonly SelectionBucket[]>(readBuckets(datasetId));
  return atom(
    (get) => get(base),
    (get, set, update: SetStateAction<readonly SelectionBucket[]>) => {
      const next = normalizeSelectionBuckets(
        typeof update === "function" ? update(get(base)) : update,
      );
      set(base, next);
      writeBuckets(datasetId, next);
    },
  );
});

/**
 * The bucket the user chose for actions, or "" to fall back to the default
 * rule. (An empty string rather than null: without strict null checks, a
 * null initial value resolves to jotai's read-only overload.)
 */
export const targetBucketAtom = atomFamily((_domainId: string) => atom(""));

/** Every configured bucket's captures in one domain. */
export const bucketCapturesAtom = atomFamily((domainId: string) =>
  atom((get) => {
    const buckets = get(bucketsAtom(selectionDomainDataset(domainId)));
    return new Map(
      buckets.map(
        (bucket) =>
          [
            bucket.id,
            get(selectionAtom(selectionCaptureKey(domainId, bucket.id))),
          ] as const,
      ),
    ) as ReadonlyMap<string, Captures>;
  }),
);

/** Stable action inputs exclude refreshed display metadata. */
export const captureRequestsAtom = atomFamily((domainId: string) =>
  atom((get) =>
    JSON.stringify(
      [...get(bucketCapturesAtom(domainId))].map(([id, captures]) => [
        id,
        capturedScopeSources([...captures.values()]),
      ]),
    ),
  ),
);

/** Deduplicated server unions for buckets containing group captures. */
export const captureScopesAtom = atomFamily((_domainId: string) =>
  atom<
    ReadonlyMap<
      string,
      {
        readonly key: string;
        readonly counts?: SelectionCounts;
        readonly scope?: {
          readonly kind: "snapshot";
          readonly snapshotId: string;
          readonly counts: SelectionCounts;
        };
        readonly error?: string;
      }
    >
  >(new Map()),
);

/** Which buckets hold each captured parent, for tiles and the legacy session. */
export const membershipAtom = atomFamily((domainId: string) =>
  atom((get) => {
    const membership = new Map<string, string[]>();
    for (const [bucketId, captures] of get(bucketCapturesAtom(domainId)))
      for (const episodeId of captures.keys()) {
        const list = membership.get(episodeId);
        if (list) list.push(bucketId);
        else membership.set(episodeId, [bucketId]);
      }
    return membership as ReadonlyMap<string, readonly string[]>;
  }),
);

/**
 * The bucket actions apply to: the user's choice while it holds captures,
 * otherwise the first bucket that does, otherwise the first bucket.
 */
export const resolvedTargetAtom = atomFamily((domainId: string) =>
  atom((get) => {
    const buckets = get(bucketsAtom(selectionDomainDataset(domainId)));
    const captures = get(bucketCapturesAtom(domainId));
    const explicit = get(targetBucketAtom(domainId));
    if (explicit && captures.get(explicit)?.size) return explicit;
    const populated = buckets.find((bucket) => captures.get(bucket.id)?.size);
    if (populated) return populated.id;
    return explicit && buckets.some((bucket) => bucket.id === explicit)
      ? explicit
      : buckets[0].id;
  }),
);

type Metadata = Record<
  string,
  Pick<
    EpisodeSelection,
    | "filepath"
    | "previewStart"
    | "unavailable"
    | "groupId"
    | "node"
    | "aspectRatio"
    | "crop"
  >
>;

/** Refresh display metadata in every bucket that holds a described parent. */
export const refreshMetadataAtom = atomFamily((domainId: string) =>
  atom(null, (get, set, metadata: Metadata) => {
    for (const bucket of get(bucketsAtom(selectionDomainDataset(domainId)))) {
      const target = selectionAtom(selectionCaptureKey(domainId, bucket.id));
      const current = get(target);
      if (![...current.keys()].some((id) => metadata[id])) continue;
      set(
        target,
        new Map(
          [...current].map(([id, group]) => [
            id,
            metadata[id] ? { ...group, ...metadata[id] } : group,
          ]),
        ),
      );
    }
  }),
);

/** Empty one bucket's captures in a domain and reset its fold. */
export const clearBucketAtom = atomFamily((domainId: string) =>
  atom(null, (get, set, bucketId: string) => {
    const key = selectionCaptureKey(domainId, bucketId);
    if (get(selectionAtom(key)).size) set(selectionAtom(key), new Map());
    set(foldRevealedAtom(key), 0);
  }),
);

/** The captured parents every bucket's strip renders, for the details loader. */
export const renderedCaptureIdsAtom = atomFamily((domainId: string) =>
  atom((get) => {
    const ids = new Set<string>();
    for (const [bucketId, captures] of get(bucketCapturesAtom(domainId))) {
      const revealed = get(
        foldRevealedAtom(selectionCaptureKey(domainId, bucketId)),
      );
      const { head, hidden, tail } = foldWindow([...captures.keys()], revealed);
      for (const id of hidden ? [...head, ...tail] : head) ids.add(id);
    }
    return [...ids].sort();
  }),
);

/**
 * A bare capture of a parent another bucket already describes takes that
 * bucket's display metadata. The details loader only refetches when the set
 * of captured parents changes, and a second copy does not change it.
 */
function withKnownMetadata(
  get: Getter,
  domainId: string,
  group: EpisodeSelection,
): EpisodeSelection {
  if (group.filepath || group.node) return group;
  for (const bucket of get(bucketsAtom(selectionDomainDataset(domainId)))) {
    const known = get(
      selectionAtom(selectionCaptureKey(domainId, bucket.id)),
    ).get(group.episodeId);
    if (!known || (!known.filepath && !known.node)) continue;
    const {
      filepath,
      previewStart,
      unavailable,
      groupId,
      node,
      aspectRatio,
      crop,
    } = known;
    return {
      ...group,
      ...(filepath !== undefined && { filepath }),
      ...(previewStart !== undefined && { previewStart }),
      ...(unavailable !== undefined && { unavailable }),
      ...(groupId !== undefined && { groupId }),
      ...(node !== undefined && { node }),
      ...(aspectRatio !== undefined && { aspectRatio }),
      ...(crop !== undefined && { crop }),
    };
  }
  return group;
}

/** Commands that touch captures in one bucket or across every bucket. */
export type BucketCommand =
  | {
      readonly type: "capture";
      readonly bucketId: string;
      readonly group: EpisodeSelection;
      readonly operation?: "replace" | "add";
    }
  | {
      readonly type: "remove";
      readonly bucketId: string;
      readonly episodeId: string;
    }
  | { readonly type: "remove-everywhere"; readonly episodeId: string }
  | {
      readonly type: "remove-members-everywhere";
      readonly members: readonly SelectionMember[];
    }
  | {
      readonly type: "remove-snapshots-everywhere";
      readonly snapshotIds: readonly string[];
    }
  | { readonly type: "clear-all" };

export const bucketCommandAtom = atomFamily((domainId: string) =>
  atom(null, (get, set, command: BucketCommand) => {
    if (command.type === "capture") {
      const target = selectionAtom(
        selectionCaptureKey(domainId, command.bucketId),
      );
      const current = get(target);
      const next = new Map(current);
      next.set(
        command.group.episodeId,
        updateEpisodeSelection(
          current.get(command.group.episodeId),
          withKnownMetadata(get, domainId, command.group),
          command.operation ?? "replace",
        ),
      );
      set(target, next);
      return;
    }
    if (command.type === "remove") {
      const target = selectionAtom(
        selectionCaptureKey(domainId, command.bucketId),
      );
      const current = get(target);
      if (!current.has(command.episodeId)) return;
      const next = new Map(current);
      next.delete(command.episodeId);
      set(target, next);
      return;
    }
    const buckets = get(bucketsAtom(selectionDomainDataset(domainId)));
    for (const bucket of buckets) {
      const key = selectionCaptureKey(domainId, bucket.id);
      const target = selectionAtom(key);
      const current = get(target);
      if (command.type === "clear-all") {
        if (current.size) set(target, new Map());
        set(foldRevealedAtom(key), 0);
        continue;
      }
      if (command.type === "remove-everywhere") {
        if (!current.has(command.episodeId)) continue;
        const next = new Map(current);
        next.delete(command.episodeId);
        set(target, next);
        continue;
      }
      if (command.type === "remove-snapshots-everywhere") {
        const ids = new Set(command.snapshotIds);
        const next = new Map(
          [...current].filter(
            ([, group]) =>
              !group.group?.snapshotId || !ids.has(group.group.snapshotId),
          ),
        );
        if (next.size !== current.size) set(target, next);
        continue;
      }
      const keys = new Set(command.members.map(selectionMemberKey));
      let changed = false;
      const next = new Map(current);
      for (const [id, group] of current) {
        const remaining = group.members.filter(
          (member) => !keys.has(selectionMemberKey(member)),
        );
        if (remaining.length === group.members.length) continue;
        changed = true;
        if (!remaining.length) next.delete(id);
        else next.set(id, { ...group, members: remaining });
      }
      if (changed) set(target, next);
    }
    if (command.type === "clear-all") set(targetBucketAtom(domainId), "");
  }),
);
