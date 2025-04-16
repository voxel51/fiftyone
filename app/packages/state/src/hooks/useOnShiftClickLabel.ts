import { LabelData, LabelToggledEvent } from "@fiftyone/looker";
import { FrameSample } from "@fiftyone/looker/src/state";
import { getTimelineConfigAtom } from "@fiftyone/playback";
import { getFetchFunction } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { useRecoilCallback } from "recoil";
import {
  hoveredInstances,
  HoveredInstancesLabelsTuple,
  jotaiStore,
} from "../jotai";
import { datasetName, selectedLabelMap, State, view } from "../recoil";
import { hoveredSample, selectedLabels } from "../recoil/atoms";

const MAX_SIMILAR_LABELS_RESPONSE_CACHE_SIZE = 25;
const MAX_SIMILAR_LABELS_RESPONSE_CACHE_TTL = 60 * 1000;

/**
 * We cache similar labels responses to avoid making multiple requests to
 * the server for the same instance id.
 *
 * Ideally this would be handled in our fetch layer with a SWR-like
 * mechanism, but that is not yet implemented.
 * */
const similarLabelsCache = new LRUCache<string, SimilarLabelsResponse | null>({
  max: MAX_SIMILAR_LABELS_RESPONSE_CACHE_SIZE,
  ttl: MAX_SIMILAR_LABELS_RESPONSE_CACHE_TTL,
});

type SimilarLabelsResponse = {
  count: number;
  instance_id: string;
  label_id_map: Record<string, number>;
  range: [number, number];
};

const fetchSimilarLabels = async ({
  instanceId,
  sampleId,
  numFrames,
  dataset,
  view,
}: {
  instanceId: string;
  sampleId: string;
  numFrames: number;
  dataset: string;
  view: State.Stage[];
}): Promise<SimilarLabelsResponse | null> => {
  try {
    const response = await getFetchFunction()(
      "POST",
      `/get-similar-labels-frames`,
      {
        instanceId,
        sampleId,
        numFrames,
        dataset,
        view,
      }
    );

    return response as SimilarLabelsResponse;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getSimilarLabelsCached = async (params: {
  instanceId: string;
  sampleId: string;
  numFrames: number;
  dataset: string;
  view: State.Stage[];
}): Promise<SimilarLabelsResponse | null> => {
  const { instanceId, sampleId, numFrames, dataset, view } = params;

  const key = JSON.stringify([
    instanceId,
    sampleId,
    numFrames,
    dataset,
    (view ?? []).map((v) => `${v._cls}-${v._uuid}`),
  ]);

  if (similarLabelsCache.has(key)) {
    return similarLabelsCache.get(key) || null;
  }

  // preemptively set key to null to avoid race condition
  // or otherwise fetch from multiple looker instances will trigger multiple requests
  similarLabelsCache.set(key, null);

  try {
    const result = await fetchSimilarLabels(params);
    similarLabelsCache.set(key, result);
    return result;
  } catch (error) {
    console.error(error);
    similarLabelsCache.delete(key);
    return null;
  }
};

export const useOnShiftClickLabel = () => {
  const handleGroup = useRecoilCallback(
    ({ set, snapshot }) =>
      async (e: LabelToggledEvent) => {
        const { sourceInstanceId } = e.detail;

        const currentHoveredInstances = jotaiStore.get(hoveredInstances);

        if (!currentHoveredInstances || currentHoveredInstances.length !== 2) {
          return;
        }

        const [currentlyHoveredInstanceId, currentlyHoveredInstanceLabels] =
          currentHoveredInstances;

        if (sourceInstanceId !== currentlyHoveredInstanceId) {
          console.error(
            "sourceInstanceId",
            sourceInstanceId,
            "does not match currentlyHoveredInstanceId",
            currentlyHoveredInstanceId
          );
          return;
        }

        const currentSelectedLabels = snapshot
          .getLoadable(selectedLabelMap)
          .getValue();

        const currentSelectedInstances = Object.values(
          currentSelectedLabels
        ).filter((label) => sourceInstanceId === label.instanceId);
        const currentSelectedInstanceCount = currentSelectedInstances.length;
        const currentHoveredInstanceCount = Object.keys(
          currentlyHoveredInstanceLabels
        ).length;

        // scenario 1, when no similar instances are selected
        if (currentSelectedInstanceCount === 0) {
          set(selectedLabels, (prev) => {
            return [
              ...prev,
              ...Object.values(currentlyHoveredInstanceLabels).map((e) => ({
                sampleId: e.sampleId,
                labelId: e.labelId,
                frameNumber: e.frameNumber,
                field: e.field,
                instanceId: e.instanceId,
              })),
            ];
          });
          e.stopImmediatePropagation();
          return;
        }

        // scenario 2, when all similar instances are selected
        if (currentSelectedInstanceCount === currentHoveredInstanceCount) {
          set(selectedLabels, (prev) => {
            return prev.filter(
              (label) => label.instanceId !== currentlyHoveredInstanceId
            );
          });
          e.stopImmediatePropagation();
          return;
        }

        // scenario 3, when some similar instances are selected
        if (
          currentSelectedInstanceCount > 0 &&
          currentSelectedInstanceCount < currentHoveredInstanceCount
        ) {
          const labelsToAdd = Object.values(currentlyHoveredInstanceLabels)
            .filter((l) => !currentSelectedLabels[l.labelId])
            .map((l) => ({
              sampleId: l.sampleId,
              labelId: l.labelId,
              frameNumber: l.frameNumber,
              field: l.field,
              instanceId: l.instanceId,
            }));

          if (labelsToAdd.length > 0) {
            set(selectedLabels, (prev) => {
              return [...prev, ...labelsToAdd].filter(
                (v, i, self) =>
                  self.findIndex((t) => t.labelId === v.labelId) === i
              );
            });
            e.stopImmediatePropagation();
          }

          return;
        }
      },
    []
  );

  const handleVideo = useRecoilCallback(
    ({ set, snapshot }) =>
      async (sampleId: string, labels: LabelData[], e: LabelToggledEvent) => {
        const { sourceInstanceId, sourceLabelId } = e.detail;

        if (!sourceInstanceId) {
          return;
        }

        const currentView = snapshot.getLoadable(view).getValue();

        const similarLabels = await getSimilarLabelsCached({
          instanceId: sourceInstanceId,
          sampleId,
          numFrames:
            jotaiStore.get(getTimelineConfigAtom(`timeline-${sampleId}`))
              .totalFrames ?? 1,
          dataset: snapshot.getLoadable(datasetName).getValue(),
          view: currentView,
        });

        if (!similarLabels) {
          return;
        }

        const currentHoveredInstances = jotaiStore.get(hoveredInstances);

        if (!currentHoveredInstances || currentHoveredInstances.length !== 2) {
          return;
        }

        const fieldName = (
          currentHoveredInstances[1] as HoveredInstancesLabelsTuple[1]
        )[sourceLabelId].field;

        const { label_id_map: labelIdMap } = similarLabels;

        const labelsToAddOrRemove = Object.entries(labelIdMap).map(
          ([labelId, frameNumber]) => ({
            sampleId,
            labelId,
            frameNumber,
            field: fieldName,
            instanceId: sourceInstanceId,
          })
        );

        // if current label is already selected, and shift + click pressed,
        // assume user wants to deselect all instances with that instance config
        const currentSelectedLabels = snapshot
          .getLoadable(selectedLabelMap)
          .getValue();

        if (currentSelectedLabels[sourceLabelId]) {
          set(selectedLabels, (prev) => {
            return [
              ...prev.filter((label) => label.instanceId !== sourceInstanceId),
            ];
          });
        } else {
          set(selectedLabels, (prev) => {
            return [...prev, ...labelsToAddOrRemove];
          });
        }
      },
    []
  );

  return useRecoilCallback(
    ({ snapshot }) =>
      async (sampleId: string, labels: LabelData[], e: LabelToggledEvent) => {
        const { sourceInstanceId, sourceSampleId } = e.detail;

        if (!sourceInstanceId) {
          return;
        }

        /**
         * IN GROUPS:
         *
         * Let k = number of currently hovered similar instances
         * Let n = number of instances in the modal with that instance config
         *
         * Three possible cases:
         * 1. If k = 0, shift + click selects all instances with that instance config
         * 2. If k = n, shift + click deselects all instances with that instance config
         * 3. If 0 < k < n, shift + click selects all instances with that instance config
         *
         * IN VIDEO DATASETS:
         *
         * Two possible cases:
         * 1. Shift + click selects all instances with that instance config.
         * 2. Shift + click deselects all instances with that instance config.
         */

        const hoveredSampleValue = snapshot
          .getLoadable(hoveredSample)
          .getValue() as unknown as FrameSample;

        if (!hoveredSampleValue) {
          return;
        }

        const isVideoWithMultipleFrames =
          hoveredSampleValue?._media_type === "video" &&
          hoveredSampleValue?.frames?.length > 0;

        if (isVideoWithMultipleFrames) {
          return handleVideo(sourceSampleId, labels, e);
        } else {
          return handleGroup(sampleId, labels, e);
        }
      },
    [handleGroup, handleVideo]
  );
};
