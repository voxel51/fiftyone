/**
 * The sample-level {@link LabelStore}: an identity-addressed adapter over the
 * `Sample` model (`Sample` is one store implementation, not the center).
 *
 * Responsibilities beyond delegation:
 * - ref addressing: `(path, instanceId)` ops onto `Sample`'s `(path, id?)`
 *   API, stamping `_id = ref.instanceId` on writes (refs own identity).
 * - change translation: `SampleChange` (path/labelId) → `LabelChange`
 *   (full {@link LabelRef}), expanding path-level changes into per-ref
 *   changes by diffing an instanceId index per label path.
 */

import type {
  JSONDeltas,
  LabelData,
  Sample,
  SampleChange,
  TransientSnapshot,
} from "@fiftyone/utilities";
import {
  isListLabelType,
  LabelType,
  SampleChangeKind,
  type Schema,
} from "@fiftyone/utilities";

import type { LabelRef } from "../identity/ref";
import type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelChangeKind,
  LabelStore,
  StoreSnapshot,
} from "./types";
import { wholeSampleReset } from "./types";

const CHANGE_KIND: Record<SampleChangeKind, LabelChangeKind> = {
  [SampleChangeKind.Update]: "update",
  [SampleChangeKind.Delete]: "delete",
  [SampleChangeKind.Reset]: "reset",
};

/** Dotted label paths in the schema (fields with a known label type). */
const collectLabelPaths = (
  schema: Schema,
  getLabelType: (path: string) => LabelType,
  prefix = ""
): string[] => {
  const paths: string[] = [];

  for (const [name, field] of Object.entries(schema ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;

    if (getLabelType(path) !== LabelType.Unknown) {
      paths.push(path);
      continue;
    }

    if (field.fields) {
      paths.push(...collectLabelPaths(field.fields, getLabelType, path));
    }
  }

  return paths;
};

export class SampleLabelStore implements LabelStore {
  readonly sample: string;

  private readonly source: Sample;
  private readonly changeListeners = new Set<ChangeListener>();
  private readonly unsubscribeSource: () => void;

  /** instanceIds per label path as of the last dispatch — the "before" side
   *  when a path-level change must be expanded into per-ref changes. */
  private knownIds = new Map<string, Set<string>>();

  constructor(sample: string, source: Sample) {
    this.sample = sample;
    this.source = source;
    this.rebuildIndex();
    this.unsubscribeSource = this.source.subscribeChanges(this.relay);
  }

  /**
   * Detach from the source `Sample`. The instance is shared and outlives the
   * store (sample switches re-key a new store over it) — a disposed store
   * left subscribed would keep relaying the next sample's changes under the
   * old sample id.
   */
  dispose(): void {
    this.unsubscribeSource();
  }

  // ---- resolution ----

  getLabel(ref: LabelRef): LabelData | undefined {
    if (isListLabelType(this.source.getLabelType(ref.path))) {
      return this.source.getLabel(ref.path, ref.instanceId);
    }

    const label = this.source.getLabel(ref.path);

    if (!label || label._id !== ref.instanceId) {
      return undefined;
    }

    return label;
  }

  listLabels(path: string): LabelData[] {
    return this.currentLabels(path);
  }

  getLabelType(path: string): LabelType {
    return this.source.getLabelType(path);
  }

  enumerateLabels(kinds: readonly LabelType[]): LabelRef[] {
    const refs: LabelRef[] = [];

    for (const path of this.labelPaths()) {
      if (!kinds.includes(this.source.getLabelType(path))) {
        continue;
      }

      for (const label of this.currentLabels(path)) {
        refs.push(this.refFor(path, label._id));
      }
    }

    return refs;
  }

  dirtyFrames(): number[] {
    return [];
  }

  // ---- mutation ----

  updateLabel(ref: LabelRef, partial: Partial<LabelData>): void {
    this.source.updateLabel(ref.path, { ...partial, _id: ref.instanceId });
  }

  replaceLabel(ref: LabelRef, value: Partial<LabelData>): void {
    this.source.replaceLabel(ref.path, { ...value, _id: ref.instanceId });
  }

  deleteLabel(ref: LabelRef): void {
    if (isListLabelType(this.source.getLabelType(ref.path))) {
      this.source.deleteLabel(ref.path, ref.instanceId);
      return;
    }

    if (this.getLabel(ref)) {
      this.source.deleteLabel(ref.path);
    }
  }

  // ---- observability ----

  subscribe(listener: DisplayListener): () => void {
    return this.source.subscribe(listener);
  }

  subscribeChanges(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  // ---- atomicity ----

  snapshot(): StoreSnapshot {
    return this.source.snapshotTransient();
  }

  restore(snapshot: StoreSnapshot): void {
    this.source.restoreTransient(snapshot as TransientSnapshot);
  }

  // ---- persistence ----

  getJsonPatch(opts: { isGenerated?: boolean } = {}): JSONDeltas {
    return this.source.getJsonPatch(opts);
  }

  pendingPaths(): readonly string[] {
    return this.source.pendingPaths();
  }

  isDirty(): boolean {
    return this.source.isDirty();
  }

  reconcilePersisted(deltas: JSONDeltas): void {
    this.source.reconcilePersisted(deltas);
  }

  // ---- lifecycle ----

  setData(data: Record<string, unknown>): void {
    this.source.setData(data);
  }

  clear(): void {
    this.source.clear();
  }

  // ---- change translation ----

  private relay = (changes: readonly SampleChange[]): void => {
    const translated = this.translate(changes);

    if (translated.length === 0) {
      return;
    }

    for (const listener of this.changeListeners) {
      listener(translated);
    }
  };

  private translate(changes: readonly SampleChange[]): LabelChange[] {
    const out: LabelChange[] = [];

    for (const change of changes) {
      if (change.path === "") {
        this.rebuildIndex();
        out.push(wholeSampleReset(this.sample));
        continue;
      }

      if (this.source.getLabelType(change.path) === LabelType.Unknown) {
        // Non-label field (primitive/metadata): the display channel covers it.
        continue;
      }

      if (change.labelId) {
        const ids = this.idsAt(change.path);
        const kind = CHANGE_KIND[change.kind];

        if (kind === "delete") {
          ids.delete(change.labelId);
        } else {
          ids.add(change.labelId);
        }

        out.push({ ref: this.refFor(change.path, change.labelId), kind });
        continue;
      }

      // Path-level change (setField, single-label ops, per-path reconcile
      // reset): expand against the index. Translation runs post-mutation, so
      // current state is the "after" side.
      const before = this.idsAt(change.path);
      const current = new Set(
        this.currentLabels(change.path).map((label) => label._id)
      );

      for (const id of before) {
        if (!current.has(id)) {
          out.push({ ref: this.refFor(change.path, id), kind: "delete" });
        }
      }

      for (const id of current) {
        out.push({
          ref: this.refFor(change.path, id),
          kind: CHANGE_KIND[change.kind],
        });
      }

      this.knownIds.set(change.path, current);
    }

    return out;
  }

  // ---- internals ----

  private refFor(path: string, instanceId: string): LabelRef {
    return { sample: this.sample, path, instanceId };
  }

  private labelPaths(): string[] {
    return collectLabelPaths(this.source.getSchema(), (path) =>
      this.source.getLabelType(path)
    );
  }

  /** Current labels at a path — list elements, or the single label as [it]. */
  private currentLabels(path: string): LabelData[] {
    if (isListLabelType(this.source.getLabelType(path))) {
      return this.source.listLabels(path);
    }

    const label = this.source.getLabel(path);

    if (!label || label._id === undefined) {
      return [];
    }

    return [label];
  }

  private idsAt(path: string): Set<string> {
    let ids = this.knownIds.get(path);

    if (!ids) {
      ids = new Set();
      this.knownIds.set(path, ids);
    }

    return ids;
  }

  private rebuildIndex(): void {
    this.knownIds = new Map(
      this.labelPaths().map((path) => [
        path,
        new Set(this.currentLabels(path).map((label) => label._id)),
      ])
    );
  }
}
