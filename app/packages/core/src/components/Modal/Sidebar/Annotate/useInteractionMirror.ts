import { useAnnotationEngine, useInteraction } from "@fiftyone/annotation";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { editing } from "./Edit";
import useExit from "./Edit/useExit";
import { hoveringLabelIds } from "./useHover";
import { labelMap } from "./useLabels";

const STORE = getDefaultStore();

/**
 * TRANSITIONAL: one-way mirror from engine interaction state onto the legacy
 * sidebar atoms (`editing`, `hoveringLabelIds`), so legacy readers keep
 * working while surfaces migrate to the engine hooks. The 2D write paths
 * (focus, hover, sidebar rows) write the engine; this is the only writer of
 * the legacy atoms for those flows. Surfaces not yet migrated (3D, drafts)
 * still write the legacy atoms directly — the mirror is edge-triggered and
 * never clobbers them between engine changes. Applied in effects, after the
 * engine's dispatch has finished. Deleted per surface as each one migrates.
 */
export const useInteractionMirror = (): void => {
  const engine = useAnnotationEngine();
  const anchor = useInteraction(engine, (i) => i.getAnchor());
  const hovered = useInteraction(engine, (i) => i.getHovered());
  const labels = useAtomValue(labelMap);
  const setEditing = useSetAtom(editing);
  const setHovering = useSetAtom(hoveringLabelIds);
  const onExit = useExit();

  useEffect(() => {
    setHovering(hovered.map((ref) => ref.instanceId));
  }, [hovered, setHovering]);

  useEffect(() => {
    const value = STORE.get(editing);
    const isDraft =
      typeof value === "string" || (value !== null && STORE.get(value)?.isNew);

    // the draft lock is surface-owned: a pre-entity or uncommitted draft
    // holds the form until its own flow releases it
    if (isDraft) {
      return;
    }

    if (!anchor) {
      if (value) {
        onExit();
      }

      return;
    }

    const labelAtom = labels[anchor.instanceId];

    if (labelAtom && labelAtom !== value) {
      setEditing(labelAtom);
    }
  }, [anchor, labels, onExit, setEditing]);
};
