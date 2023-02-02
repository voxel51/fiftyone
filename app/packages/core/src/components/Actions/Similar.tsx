import React, { useCallback, useLayoutEffect, useState } from "react";
import {
  atom,
  selectorFamily,
  Snapshot,
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";

import { SORT_BY_SIMILARITY } from "../../utils/links";
import { useUnprocessedStateUpdate } from "@fiftyone/state";

import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import RadioGroup from "../Common/RadioGroup";
import { Button } from "../utils";

import { ActionOption } from "./Common";
import Popout from "./Popout";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { useErrorHandler } from "react-error-boundary";
import { useTheme, PopoutSectionTitle } from "@fiftyone/components";
import * as fos from "@fiftyone/state";

const getQueryIds = async (snapshot: Snapshot, brainKey?: string) => {
  const selectedLabelIds = await snapshot.getPromise(fos.selectedLabelIds);
  const selectedLabels = await snapshot.getPromise(fos.selectedLabels);
  const keys = await snapshot.getPromise(fos.similarityKeys);
  const labels_field = keys.patches
    .filter(([k, v]) => k === brainKey)
    .map(([k, v]) => v)[0];
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

const useSortBySimilarity = (close) => {
  const update = useUnprocessedStateUpdate();
  const handleError = useErrorHandler();

  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (parameters: fos.State.SortBySimilarityParameters) => {
        const queryIds = await getQueryIds(snapshot, parameters.brainKey);
        const view = await snapshot.getPromise(fos.view);
        set(fos.similaritySorting, true);

        try {
          const data = await getFetchFunction()("POST", "/sort", {
            dataset: await snapshot.getPromise(fos.datasetName),
            view,
            filters: await snapshot.getPromise(fos.filters),
            extended: toSnakeCase({
              ...parameters,
              queryIds,
            }),
          });

          // update selectedSamples atom to new set.
          // modifying data, otherwise useStateUpdate will set the selectedSamples again
          data.state.selected = [];

          update(({ set }) => {
            set(fos.similarityParameters, {
              ...parameters,
              queryIds,
            });
            set(fos.modal, null);
            set(fos.similaritySorting, false);
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

const searchBrainKeyValue = atom<string>({
  key: "searchBrainKeyValue",
  default: "",
});

const availableSimilarityKeys = selectorFamily<string[], boolean>({
  key: "availableSimilarityKeys",
  get:
    (modal) =>
    ({ get }) => {
      const isPatches = get(fos.isPatchesView);
      const keys = get(fos.similarityKeys);
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

const currentSimilarityKeys = selectorFamily<
  { total: number; choices: string[] },
  boolean
>({
  key: "currentSimilarityKeys",
  get:
    (modal) =>
    ({ get }) => {
      const searchBrainKey = get(searchBrainKeyValue);
      const keys = get(availableSimilarityKeys(modal));
      const result = keys.filter((k) => k.includes(searchBrainKey)).sort();
      return {
        total: keys.length,
        choices: result.slice(0, 11),
      };
    },
});

const sortType = selectorFamily<string, boolean>({
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

interface SortBySimilarityProps {
  modal: boolean;
  close: () => void;
  bounds?: any;
}

const SortBySimilarity = React.memo(
  ({ modal, bounds, close }: SortBySimilarityProps) => {
    const current = useRecoilValue(fos.similarityParameters);
    const [state, setState] = useState<fos.State.SortBySimilarityParameters>(
      () =>
        current
          ? current
          : { brainKey: null, distField: null, reverse: false, k: null }
    );

    const setParameter = useCallback(
      (name: string, value) =>
        setState((state) => ({ ...state, [name]: value })),
      []
    );

    const hasSorting = Boolean(current);
    const reset = useRecoilCallback(
      ({ reset }) =>
        () =>
          reset(fos.similarityParameters)
    );
    const hasSimilarityKeys =
      useRecoilValue(availableSimilarityKeys(modal)).length > 0;

    const choices = useRecoilValue(currentSimilarityKeys(modal));
    const sortBySimilarity = useSortBySimilarity(close);
    const type = useRecoilValue(sortType(modal));
    const theme = useTheme();

    useLayoutEffect(() => {
      choices.choices.length === 1 &&
        setParameter("brainKey", choices.choices[0]);
    }, [choices]);

    useLayoutEffect(() => {
      current && setState(current);
    }, [current]);

    return (
      <Popout modal={modal} bounds={bounds}>
        <PopoutSectionTitle>
          <ActionOption
            href={SORT_BY_SIMILARITY}
            text={"Sort by similarity"}
            title={"About sorting by similarity"}
            style={{
              background: "unset",
              color: theme.text.primary,
              paddingTop: 0,
              paddingBottom: 0,
            }}
            svgStyles={{ height: "1rem", marginTop: 7.5 }}
          />
        </PopoutSectionTitle>
        {hasSimilarityKeys && (
          <>
            <Input
              placeholder={"k (default = None)"}
              validator={(value) => value === "" || /^[0-9\b]+$/.test(value)}
              value={state.k === null ? "" : String(state.k)}
              setter={(value) => {
                setParameter("k", value === "" ? null : Number(value));
              }}
            />
            <Input
              placeholder={"dist_field (default = None)"}
              validator={(value) => !value.startsWith("_")}
              value={state.distField === null ? "" : state.distField}
              setter={(value) => {
                setParameter("distField", value === "" ? null : value);
              }}
            />
            <Checkbox
              name={"reverse"}
              value={Boolean(state.reverse)}
              setValue={(v) => setParameter("reverse", v)}
            />
            <PopoutSectionTitle style={{ fontSize: 14 }}>
              Brain key
            </PopoutSectionTitle>
            <RadioGroup
              choices={choices.choices}
              value={state.brainKey}
              setValue={(v) => setParameter("brainKey", v)}
            />
            {state.brainKey && (
              <>
                <PopoutSectionTitle></PopoutSectionTitle>
                <Button
                  text={"Apply"}
                  title={`Sort by similarity to the selected ${type}`}
                  onClick={() => {
                    sortBySimilarity(state);
                  }}
                  style={{
                    margin: "0.25rem -0.5rem",
                    height: "2rem",
                    borderRadius: 0,
                    textAlign: "center",
                  }}
                ></Button>
              </>
            )}
          </>
        )}
        {hasSorting && (
          <>
            <PopoutSectionTitle></PopoutSectionTitle>
            <Button
              text={"Reset"}
              title={`Clear sorting`}
              onClick={() => {
                close();
                reset();
              }}
              style={{
                margin: "0.25rem -0.5rem",
                height: "2rem",
                borderRadius: 0,
                textAlign: "center",
              }}
            ></Button>
          </>
        )}
      </Popout>
    );
  }
);

export default SortBySimilarity;
