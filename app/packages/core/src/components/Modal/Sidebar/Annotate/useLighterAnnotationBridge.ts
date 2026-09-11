import {
  useAnnotationEngine,
  useLighterEngineBridge,
} from "@fiftyone/annotation";
import {
  useCurrentDatasetId,
  useIsImageDynamicGroupVideo,
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
 * Mount the image Lighter surface on the annotation engine, scoped to the
 * visible schema paths and disabled on video surfaces (which mount their own
 * frame-stamping bridge). Mount once at the annotation root, after
 * `useSyncAnnotationEngine`.
 */
export const useLighterAnnotationBridge = (): void => {
  const engine = useAnnotationEngine();
  const modalSample = useModalSample();
  const active = useAtomValue(visibleLabelSchemas);
  const interactionPolicy = useLighterInteractionPolicy();
  const dataset = useCurrentDatasetId() ?? "";

  // the video surface (a video sample or an image dynamic group video) mounts
  // its own frame-stamping bridge; this frame-less one must stay off there
  const isVideo = useIsVideo();
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();
  const isVideoSurface = isVideo || isImageDynamicGroupVideo;

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
    enabled: !isVideoSurface,
  });

  // overlay read-only flags are Lighter-surface state — owned here, off the
  // engine + scene, never written from the sidebar list
  useSyncOverlayReadOnly(sampleId);
};
