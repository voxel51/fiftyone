import {
  useAnnotationEngine,
  useAnnotationEventBus,
  useInteraction,
} from "@fiftyone/annotation";
import { current } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext/selectors";
import { labelSchemaData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import { getDefaultStore } from "jotai";
import { useEffect, useRef } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { ANNOTATION_CUBOID, ANNOTATION_POLYLINE } from "../constants";
import {
  clearTransformStateSelector,
  currentArchetypeSelectedForTransformAtom,
  hoveredLabelAtom,
  selectedLabelForAnnotationAtom,
  transformModeAtom,
} from "../state";
import { useSetCurrent3dAnnotationMode } from "../state/accessors";
import { isDetection3dOverlay, isPolyline3dOverlay } from "../types";
import { useWorkingDoc } from "./store";

const STORE = getDefaultStore();

const isDraftEditing = (): boolean => {
  return Boolean(STORE.get(current)?.isNew);
};

/**
 * This surface's read-half for engine interaction state: the anchor drives
 * scene selection (transform controls, selection atoms) and the hovered set
 * drives the 3D hover highlight — for labels this surface owns (working-store
 * membership decides; no cross-surface shape checks). The write-half is
 * {@link useSelect3DLabelForAnnotation} (canvas clicks → anchor).
 *
 * Edge-triggered: it only touches scene state when the 3D-relevant
 * projection changes, so it never fights the surface-owned draft flows
 * (a pre-entity draft also suspends the anchor-empty clear).
 */
export const use3dInteractionAdapter = (): void => {
  const engine = useAnnotationEngine();
  const anchor = useInteraction(engine, (i) => i.getAnchor());
  const hovered = useInteraction(engine, (i) => i.getHovered());
  const workingDoc = useWorkingDoc();
  const eventBus = useAnnotationEventBus();

  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom,
  );
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom,
  );
  const clearTransformState = useSetRecoilState(clearTransformStateSelector);
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);

  const transformModeRef = useRef(transformMode);
  transformModeRef.current = transformMode;

  // selection: anchor → scene selection + transform state
  const appliedSelection = useRef<string | null>(null);

  useEffect(() => {
    const label = anchor ? workingDoc.labelsById[anchor.instanceId] : undefined;
    const targetId = label?._id ?? null;

    if (appliedSelection.current === targetId) {
      return;
    }

    if (!label) {
      // no anchor, or not this surface's label — release scene selection,
      // unless a draft owns it (pre-entity, surface-owned)
      if (!isDraftEditing()) {
        appliedSelection.current = null;
        setSelectedLabelForAnnotation(null);
        clearTransformState(null);
      }

      return;
    }

    const archetype = isDetection3dOverlay(label)
      ? ANNOTATION_CUBOID
      : isPolyline3dOverlay(label)
        ? ANNOTATION_POLYLINE
        : undefined;

    if (!archetype) {
      return;
    }

    appliedSelection.current = targetId;

    const selected = { ...label, selected: true };

    eventBus.dispatch("annotation:3dLabelSelected", {
      id: label._id,
      archetype,
      label: selected,
    });

    const isReadOnly = !!STORE.get(labelSchemaData(label.path))?.read_only;

    if (isReadOnly) {
      return;
    }

    setSelectedLabelForAnnotation(selected);
    setCurrent3dAnnotationMode(archetype);
    setCurrentArchetypeSelectedForTransform(archetype);

    // we only support translate for polylines for now
    if (
      archetype === ANNOTATION_POLYLINE &&
      (transformModeRef.current === "rotate" ||
        transformModeRef.current === "scale")
    ) {
      setTransformMode("translate");
    }
  }, [
    anchor,
    clearTransformState,
    eventBus,
    setCurrent3dAnnotationMode,
    setCurrentArchetypeSelectedForTransform,
    setSelectedLabelForAnnotation,
    setTransformMode,
    workingDoc,
  ]);

  // hover: the hovered set's 3D projection → the scene hover highlight
  const appliedHover = useRef<string | null>(null);

  useEffect(() => {
    const ref = hovered.find(
      (candidate) => workingDoc.labelsById[candidate.instanceId],
    );
    const targetId = ref?.instanceId ?? null;

    if (appliedHover.current === targetId) {
      return;
    }

    appliedHover.current = targetId;
    setHoveredLabel(targetId ? { id: targetId } : null);
  }, [hovered, setHoveredLabel, workingDoc]);
};
