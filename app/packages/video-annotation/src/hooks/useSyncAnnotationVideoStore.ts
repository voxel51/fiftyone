import {
  FrameStore,
  SampleLabelStore,
  useActiveSampleId,
  useAnnotationEngine,
  useEngineSelector,
  useSampleInstanceGetter,
  VideoLabelStore,
} from "@fiftyone/annotation";
import { type MutableRefObject, useEffect, useRef } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { parseFramesData } from "../streams/framesData";
import {
  useFrameLabelFields,
  useTemporalDetectionFieldPaths,
  useVisibleLabelSchemas,
} from "../state/accessors";

/**
 * Own the video sample's engine store for the lifetime of the surface.
 *
 * The engine federates one {@link LabelStore} per sample, so a video sample
 * registers a composite {@link VideoLabelStore} — a {@link FrameStore} for the
 * per-frame detections plus a {@link SampleLabelStore} (over the shared
 * `Sample`) for sample-level labels. The annotation root's
 * `useSyncAnnotationEngine` skips the video sample precisely so this hook can
 * own it.
 *
 * The frame backing is seeded from the active `/frames` stream and re-seeded as
 * chunks land or local edits mutate the cache (via `subscribeToEdits`).
 *
 * Must be mounted under the modal scope where the labels stream is published.
 */
export const useSyncAnnotationVideoStore = (): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const getSample = useSampleInstanceGetter();
  const stream = useFrameLabelsStream();
  const labelTypes = useFrameLabelFields();

  // Working overlay carried across an effect rebuild (e.g. activating a frame
  // field, or the labels stream re-mounting) so unsaved edits aren't dropped
  // when the FrameStore is reconstructed. This hook's component outlives the
  // keyed stream registrar, so the ref survives a stream swap but dies with the
  // surface — no edits resurrected across a modal session. Overwritten on every
  // teardown, so only an immediate same-sample rebuild restores.
  const carry = useRef<{
    sampleId: string;
    snapshot: ReturnType<FrameStore["snapshot"]>;
  } | null>(null);

  // The live sample-level backing, so the hydration nudge below can re-announce
  // it without re-registering the composite store.
  const sampleLevelRef = useRef<SampleLabelStore | null>(null);

  useEffect(() => {
    if (!sampleId || !stream) {
      return undefined;
    }

    // Register whenever the surface has a sample + stream — NOT gated on the
    // active frame fields. Deactivating every frame label field empties
    // `labelTypes`, but the composite store still owns the sample-level
    // (temporal-detection) labels; tearing it down then would sweep those
    // overlays too. Visibility/activation gates rendering, never the store.
    const frames = new FrameStore(sampleId, { labelTypes });
    const sampleLevel = new SampleLabelStore(sampleId, getSample(sampleId));
    const store = new VideoLabelStore(sampleId, frames, sampleLevel);
    const unregister = engine.registerStore(store);
    sampleLevelRef.current = sampleLevel;

    const seed = () =>
      frames.setData(parseFramesData(stream.cachedFrames(), labelTypes));
    const unsubscribe = stream.subscribeToEdits(seed);
    seed();

    // Restore edits carried from the prior FrameStore (same sample) after the
    // source seed; the working overlay is source-independent, so it wins. Each
    // carried frame still differs from the freshly-seeded (un-persisted) source,
    // so the next setData GC keeps it and autosave picks it up.
    if (carry.current && carry.current.sampleId === sampleId) {
      frames.restore(carry.current.snapshot);
    }
    carry.current = null;

    // Whole-clip seed for engine consumers that still walk every frame
    // (propagation, interpolation, track ops). The timeline no longer needs
    // it — it reads the server index. Retire once those ops fetch per-range.
    void stream.warmupAll();

    return () => {
      // Carry unsaved edits to the next FrameStore (this same hook stays
      // mounted across a stream re-mount). Overwrites any prior carry, so a
      // different sample's edits can never leak back into this one.
      carry.current = frames.isDirty()
        ? { sampleId, snapshot: frames.snapshot() }
        : null;
      unsubscribe();
      unregister();
      sampleLevel.dispose();
      sampleLevelRef.current = null;
    };
  }, [engine, sampleId, labelTypes, getSample, stream]);

  useHydrateSampleLevelOverlays(engine, sampleId, sampleLevelRef);
};

/**
 * Re-announce the sample-level backing once a sample-level label (e.g. a
 * sample Classification) becomes resolvable, so the engine Lighter bridge
 * hydrates its overlay on load.
 *
 * The bridge runs its one-shot reconcile when the surface mounts — before the
 * `Sample`'s schema has resolved the field's label type. While the type reads
 * `Unknown` the field is excluded from the bridge's schema-derived enumeration,
 * so the overlay never mounts and (the `Sample` already being loaded) no later
 * change re-fires it; only an edit would. The frame backing avoids this because
 * `frames.setData` dispatches its own changes. Temporal detections avoid it by
 * rendering through `useTemporalOverlaySync` rather than the bridge.
 *
 * The signature folds in the resolved `getLabelType`, so it changes when the
 * label data lands AND again when the type settles — the latter is the edge
 * that drives the reconcile that finally hydrates. `resync` mutates nothing, so
 * it can't loop.
 */
const useHydrateSampleLevelOverlays = (
  engine: ReturnType<typeof useAnnotationEngine>,
  sampleId: string,
  sampleLevelRef: MutableRefObject<SampleLabelStore | null>,
): void => {
  const visible = useVisibleLabelSchemas();
  const tdPaths = useTemporalDetectionFieldPaths();

  // Sample-level label fields that route through the bridge — exclude the frame
  // fields (the FrameStore announces those) and TDs (their own sync renders).
  const signature = useEngineSelector(engine, (reads) => {
    const tds = new Set(tdPaths);

    return [...visible]
      .filter((path) => !path.startsWith("frames.") && !tds.has(path))
      .sort()
      .map((path) => {
        const ids = reads
          .listLabels({ sample: sampleId, path })
          .map((label) => label._id)
          .join(",");

        return `${path}:${reads.getLabelType(path)}:${ids}`;
      })
      .join("|");
  });

  useEffect(() => {
    if (!signature) {
      return;
    }

    sampleLevelRef.current?.resync();
  }, [signature, sampleLevelRef]);
};
