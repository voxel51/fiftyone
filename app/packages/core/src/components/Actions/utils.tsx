import { animated, useSpring } from "@react-spring/web";
import { useState } from "react";
import { selectorFamily, Snapshot, useRecoilCallback } from "recoil";
import styled from "styled-components";

import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  currentSlice,
  groupId,
  groupStatistics,
  isGroup,
  State,
  useUnprocessedStateUpdate,
} from "@fiftyone/state";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { useErrorHandler } from "react-error-boundary";
import { searchBrainKeyValue } from "./similar/Similar";

export const SwitcherDiv = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.background.body};
  display: flex;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
`;

export const SwitchDiv = animated(styled.div`
  flex-basis: 0;
  flex-grow: 1;
  font-size: 1rem;
  padding-left: 0.4rem;
  line-height: 2;
  font-weight: bold;
  border-bottom-color: ${({ theme }) => theme.primary.plainColor};
  border-bottom-style: solid;
  border-bottom-width: 2px;
  text-transform: capitalize;
`);

export const useHighlightHover = (disabled, override = null, color = null) => {
  const [hovering, setHovering] = useState(false);
  const theme = useTheme();
  const on =
    typeof override === "boolean"
      ? override && !disabled
      : hovering && !disabled;
  const style = useSpring({
    backgroundColor: on ? theme.background.level1 : theme.background.level2,
    color: color ? color : on ? theme.text.primary : theme.text.secondary,
  });

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => setHovering(false);

  return {
    style: {
      ...style,
      cursor: disabled ? "default" : "pointer",
    },
    onMouseEnter,
    onMouseLeave,
  };
};

export const tagStatistics = selectorFamily<
  {
    count: number;
    items: number;
    tags: { [key: string]: number };
  },
  { modal: boolean; labels: boolean }
>({
  key: "tagStatistics",
  get:
    ({ modal, labels: count_labels }) =>
    async ({ get }) => {
      return await getFetchFunction()(
        "POST",
        "/tagging",
        tagParameters({
          activeFields: get(fos.activeLabelFields({ modal })),

          dataset: get(fos.datasetName),
          filters: get(modal ? fos.modalFilters : fos.filters),

          groupData: get(isGroup)
            ? {
                id: modal ? get(groupId) : null,
                slice: get(currentSlice(modal)),
                mode: get(groupStatistics(modal)),
              }
            : null,
          hiddenLabels: get(fos.hiddenLabelsArray),
          modal,
          sampleId: modal ? get(fos.sidebarSampleId) : null,
          selectedSamples: get(fos.selectedSamples),
          selectedLabels: Object.entries(get(fos.selectedLabels)).map(
            ([labelId, data]) => ({
              labelId,
              ...data,
            })
          ),
          targetLabels: count_labels,
          view: get(fos.view),
        })
      );
    },
});

export const numItemsInSelection = selectorFamily<number, boolean>({
  key: "numLabelsInSelectedSamples",
  get:
    (labels) =>
    ({ get }) => {
      return get(tagStatistics({ modal: false, labels })).count;
    },
});

export const selectedSamplesCount = selectorFamily<number, boolean>({
  key: "selectedSampleCount",
  get:
    (modal) =>
    ({ get }) => {
      return get(tagStatistics({ modal, labels: false })).items;
    },
});

export const tagStats = selectorFamily<
  { [key: string]: number } | null,
  { modal: boolean; labels: boolean }
>({
  key: "tagStats",
  get:
    ({ modal, labels }) =>
    ({ get }) => {
      const data = get(
        labels
          ? fos.labelTagCounts({ modal: false, extended: false })
          : fos.sampleTagCounts({ modal: false, extended: false })
      );

      return {
        ...data,
        ...get(tagStatistics({ modal, labels })).tags,
      };
    },
});

export const tagParameters = ({
  sampleId,
  targetLabels,
  hiddenLabels,
  activeFields,
  selectedSamples,
  selectedLabels,
  groupData,
  ...params
}: {
  dataset: string;
  modal: boolean;
  view: State.Stage[];
  filters: State.Filters;
  selectedSamples: Set<string>;
  selectedLabels: State.SelectedLabel[];
  hiddenLabels: State.SelectedLabel[];
  activeFields: string[];
  groupData: {
    id: string | null;
    slice: string | null;
    mode: "group" | "slice";
  } | null;
  targetLabels: boolean;
  sampleId: string | null;
}) => {
  const shouldShowCurrentSample =
    params.modal && selectedSamples.size == 0 && hiddenLabels.length == 0;
  const groups = groupData?.mode === "group";

  const getSampleIds = () => {
    if (shouldShowCurrentSample && !groups) {
      return [sampleId];
    } else if (selectedSamples.size) {
      return [...selectedSamples];
    }
    return null;
  };

  return {
    ...params,
    label_fields: activeFields,
    target_labels: targetLabels,
    slice: !params.modal && !groups ? groupData?.slice : null,
    sample_ids: getSampleIds(),
    labels:
      params.modal && targetLabels && selectedLabels && selectedLabels.length
        ? toSnakeCase(selectedLabels)
        : null,
    hidden_labels:
      params.modal && targetLabels && hiddenLabels.length
        ? toSnakeCase(hiddenLabels)
        : null,
  };
};

export const getQueryIds = async (snapshot: Snapshot, brainKey?: string) => {
  const selectedLabelIds = await snapshot.getPromise(fos.selectedLabelIds);
  const selectedLabels = await snapshot.getPromise(fos.selectedLabels);
  const methods = await snapshot.getPromise(fos.similarityMethods);

  const labels_field = methods.patches
    .filter(([m, v]) => m.key === brainKey)
    .map(([m, v]) => v)[0];
  if (selectedLabelIds.size) {
    return [...selectedLabelIds].filter(
      (id) => selectedLabels[id].field === labels_field
    );
  }
  const selectedSamples = await snapshot.getPromise(fos.selectedSamples);
  const isPatches = await snapshot.getPromise(fos.isPatchesView);
  const modal = await snapshot.getPromise(fos.modal);

  if (isPatches) {
    if (selectedSamples.size) {
      return [...selectedSamples].map((id) => {
        const sample = fos.getSample(id);
        if (sample) {
          return sample.sample[labels_field]._id;
        }

        throw new Error("sample not found");
      });
    }

    return modal.sample[labels_field]._id;
  }

  if (selectedSamples.size) {
    return [...selectedSamples];
  }

  return modal.sample._id;
};

export const useSortBySimilarity = (close) => {
  const update = useUnprocessedStateUpdate();
  const handleError = useErrorHandler();

  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (parameters: fos.State.SortBySimilarityParameters) => {
        set(fos.similaritySorting, true);

        const queryIds = parameters.query
          ? null
          : await getQueryIds(snapshot, parameters.brainKey);
        const view = await snapshot.getPromise(fos.view);
        const subscription = await snapshot.getPromise(fos.stateSubscription);

        const { query, ...commonParams } = parameters;

        const combinedParameters = {
          ...commonParams,
        };

        combinedParameters["query"] = query ?? queryIds;

        try {
          const data: fos.StateUpdate = await getFetchFunction()(
            "POST",
            "/sort",
            {
              dataset: await snapshot.getPromise(fos.datasetName),
              view,
              subscription,
              filters: await snapshot.getPromise(fos.filters),
              extended: toSnakeCase(combinedParameters),
            }
          );

          update(({ set }) => {
            set(fos.similarityParameters, combinedParameters);
            set(fos.modal, null);
            set(fos.similaritySorting, false);
            set(fos.savedLookerOptions, (cur) => ({ ...cur, showJSON: false }));
            set(fos.selectedLabels, {});
            set(fos.hiddenLabels, {});
            set(fos.modal, null);
            close();

            return data;
          });
        } catch (error) {
          handleError(error);
        }
      },
    []
  );
};

export const availableSimilarityKeys = selectorFamily<
  string[],
  { modal: boolean; isImageSearch: boolean }
>({
  key: "availableSimilarityKeys",
  get:
    ({ modal, isImageSearch }) =>
    ({ get }) => {
      const isPatches = get(fos.isPatchesView);
      let m = get(fos.similarityMethods);
      const keys: { patches: [string, string][]; samples: string[] } = {
        patches: [],
        samples: [],
      };
      if (!isImageSearch) {
        keys.patches = m.patches
          .filter(([m, f]) => m.supportsPrompts === true)
          .map(([m, f]) => [m.key, f]);
        keys.samples = m.samples
          .filter((m) => m.supportsPrompts === true)
          .map((m) => m.key);
      } else {
        keys.patches = m.patches.map(([m, f]) => [m.key, f]);
        keys.samples = m.samples.map((m) => m.key);
      }

      if (!isPatches && !modal) {
        return keys.samples;
      } else if (!modal) {
        return keys.patches.reduce((acc, [key, field]) => {
          if (get(fos.labelPaths({})).includes(field)) {
            acc = [...acc, key];
          }
          return acc;
        }, []);
      } else if (modal) {
        const selectedLabels = get(fos.selectedLabels);

        if (Object.keys(selectedLabels).length) {
          const fields = new Set(
            Object.values(selectedLabels).map(({ field }) => field)
          );

          const patches = keys.patches
            .filter(([k, v]) => fields.has(v))
            .reduce((acc, [k]) => {
              return [...acc, k];
            }, []);
          return patches;
        } else if (isPatches) {
          const { sample } = get(fos.modal);

          return keys.patches
            .filter(([k, v]) => sample[v])
            .reduce((acc, [k]) => {
              return [...acc, k];
            }, []);
        }

        return keys.samples;
      }
      return [];
    },
});

export const currentSimilarityKeys = selectorFamily<
  { total: number; choices: string[] },
  { modal: boolean; isImageSearch: boolean }
>({
  key: "currentSimilarityKeys",
  get:
    ({ modal, isImageSearch }) =>
    ({ get }) => {
      const searchBrainKey = get(searchBrainKeyValue);
      const keys = get(availableSimilarityKeys({ modal, isImageSearch }));
      const result = keys.filter((k) => k.includes(searchBrainKey)).sort();

      return {
        total: keys.length,
        choices: result.slice(0, 11),
      };
    },
});

export const sortType = selectorFamily<string, boolean>({
  key: "sortBySimilarityType",
  get:
    (modal) =>
    ({ get }) => {
      const isRoot = get(fos.isRootView);
      if (modal) {
        return "labels";
      } else if (isRoot) {
        return "images";
      } else {
        return "patches";
      }
    },
});
