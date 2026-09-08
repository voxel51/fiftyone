import {
  useAnnotationEngine,
  useLighterEngineBridge,
} from "@fiftyone/annotation";
import {
  useCurrentDatasetId,
  useIsVideo,
  useModalSample,
} from "@fiftyone/state";
import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import { getNormalizedUrls } from "@fiftyone/state/src/utils";
import { LABEL_LISTS_MAP } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { visibleLabelSchemas } from "./state";
import { useLighterInteractionPolicy } from "./useLighterInteractionPolicy";
import { useSyncOverlayReadOnly } from "./useSyncOverlayReadOnly";

/**
 * Mount the Lighter surface on the annotation engine: the bridge owns
 * overlay hydration, reconcile, gesture commits, and select/hover routing
 * (replacing the legacy `useLabels` hydration, `useSyncLighterSample`, and
 * focus/hover handlers). Scoped to the active schema paths — toggling
 * schemas re-creates the bridge (clear + rehydrate, the legacy reset
 * semantics). Selection policy (merge tool, draft lock, generated views)
 * is the modal's, injected via {@link useLighterInteractionPolicy}.
 *
 * Mount once at the annotation root, after `useSyncAnnotationEngine`.
 */
export const useLighterAnnotationBridge = (): void => {
  const engine = useAnnotationEngine();
  const modalSample = useModalSample();
  const active = useAtomValue(visibleLabelSchemas);
  const interactionPolicy = useLighterInteractionPolicy();
  const dataset = useCurrentDatasetId() ?? "";

  // a video sample shares the global lighter scene atom but is owned by the
  // video surface's own frame-locked bridge — disable this one so its handlers
  // don't bind to the video tile's scene (the video bridge stamps the frame;
  // this one would mis-route writes frame-agnostically)
  const isVideo = useIsVideo();

  const sampleId = modalSample?.sample?._id ?? "";

  // key the scope set on content so renders don't re-create the bridge
  const pathsKey = active ? [...active].sort().join(" ") : "";
  const paths = useMemo(
    () => new Set(pathsKey ? pathsKey.split(" ") : []),
    [pathsKey],
  );

  // mutable inputs go through refs so the resolver is referentially stable —
  // a new resolver identity would re-create the bridge (clear + rehydrate)
  const sourcesRef = useRef<Record<string, string>>({});
  sourcesRef.current = getNormalizedUrls(modalSample?.urls ?? {});
  const sampleRef = useRef(sampleId);
  sampleRef.current = sampleId;

  // sources keys mirror looker's structural addressing:
  // `ground_truth.detections[0].mask_path` for list elements
  const resolveMediaUrl = useCallback(
    ({
      path,
      instanceId,
      subField,
      raw,
    }: {
      path: string;
      instanceId: string;
      subField: string;
      raw: string;
    }): string | undefined => {
      const listKey =
        LABEL_LISTS_MAP[
          engine.getLabelType(path) as keyof typeof LABEL_LISTS_MAP
        ];
      let key = `${path}.${subField}`;

      if (listKey) {
        const index = engine
          .listLabels({ sample: sampleRef.current, path })
          .findIndex((label) => label._id === instanceId);
        key = `${path}.${listKey}[${index}].${subField}`;
      }

      const value = sourcesRef.current[key] ?? raw;

      return typeof value === "string" ? getSampleSrc(value) : undefined;
    },
    [engine],
  );

  useLighterEngineBridge({
    engine,
    sample: sampleId,
    dataset,
    paths,
    resolveMediaUrl,
    interactionPolicy,
    enabled: !isVideo,
  });

  // overlay read-only flags are Lighter-surface state — owned here, off the
  // engine + scene, never written from the sidebar list
  useSyncOverlayReadOnly(sampleId);
};
