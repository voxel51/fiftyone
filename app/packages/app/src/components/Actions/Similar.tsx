import React, { useCallback, useLayoutEffect, useState } from "react";
import {
  atom,
  selectorFamily,
  Snapshot,
  useRecoilCallback,
  useRecoilValue,
  useResetRecoilState,
} from "recoil";

import * as atoms from "../../recoil/atoms";
import * as schemaAtoms from "../../recoil/schema";
import * as selectors from "../../recoil/selectors";
import { State } from "../../recoil/types";
import * as viewAtoms from "../../recoil/view";
import { SORT_BY_SIMILARITY } from "../../utils/links";
import { useUnprocessedStateUpdate, useTheme } from "../../utils/hooks";

import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import RadioGroup from "../Common/RadioGroup";
import { Button } from "../utils";
import { PopoutSectionTitle } from "../utils";

import { ActionOption } from "./Common";
import Popout from "./Popout";
import { store } from "../Flashlight.store";
import { http } from "../../shared/connection";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { useErrorHandler } from "react-error-boundary";
import { aggregationsTick } from "../../recoil/aggregations";
import { filters } from "../../recoil/filters";

export const similaritySorting = atom<boolean>({
  key: "similaritySorting",
  default: false,
});

export const similarityParameters = atom<
  State.SortBySimilarityParameters & { queryIds: string[] }
>({
  key: "sortBySimilarityParameters",
  default: null,
});

const getQueryIds = async (snapshot: Snapshot, brainKey?: string) => {
  const selectedLabelIds = await snapshot.getPromise(
    selectors.selectedLabelIds
  );
  const selectedLabels = await snapshot.getPromise(selectors.selectedLabels);
  const keys = await snapshot.getPromise(selectors.similarityKeys);
  const labels_field = keys.patches
    .filter(([k, v]) => k === brainKey)
    .map(([k, v]) => v)[0];
  if (selectedLabelIds.size) {
    return [...selectedLabelIds].filter(
      (id) => selectedLabels[id].field === labels_field
    );
  }
  const selectedSamples = await snapshot.getPromise(atoms.selectedSamples);
  const isPatches = await snapshot.getPromise(viewAtoms.isPatchesView);
  const modal = await snapshot.getPromise(atoms.modal);

  if (isPatches) {
    if (selectedSamples.size) {
      return [...selectedSamples].map(
        (id) => store.samples.get(id).sample[labels_field]._id
      );
    }

    return modal.sample[labels_field]._id;
  }

  if (selectedSamples.size) {
    return [...selectedSamples];
  }

  return modal.sample._id;
};

const useSortBySimilarity = () => {
  const update = useUnprocessedStateUpdate();
  const handleError = useErrorHandler();
  return useRecoilCallback(
    ({ snapshot, set }) => async (
      parameters: State.SortBySimilarityParameters
    ) => {
      try {
        const queryIds = await getQueryIds(snapshot, parameters.brainKey);
        set(similaritySorting, true);

        const data = await getFetchFunction()("POST", "/sort", {
          dataset: await snapshot.getPromise(selectors.datasetName),
          view: await snapshot.getPromise(viewAtoms.view),
          filters: await snapshot.getPromise(filters),
          similarity: toSnakeCase({
            ...parameters,
            queryIds,
          }),
        });

        await update(data, (set) => {
          set(similarityParameters, { ...parameters, queryIds });
          set(atoms.modal, null);
          set(similaritySorting, false);
          set(aggregationsTick, (cur) => cur + 1);
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
  get: (modal) => ({ get }) => {
    const isPatches = get(viewAtoms.isPatchesView);
    const keys = get(selectors.similarityKeys);
    if (!isPatches && !modal) {
      return keys.samples;
    } else if (!modal) {
      return keys.patches.reduce((acc, [key, field]) => {
        if (get(schemaAtoms.labelPaths({})).includes(field)) {
          acc = [...acc, key];
        }
        return acc;
      }, []);
    } else if (modal) {
      const selectedLabels = get(selectors.selectedLabels);

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
        const { sample } = get(atoms.modal);

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
  get: (modal) => ({ get }) => {
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
  get: (modal) => ({ get }) => {
    const isRoot = get(viewAtoms.isRootView);
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
    const current = useRecoilValue(similarityParameters);
    const [state, setState] = useState<State.SortBySimilarityParameters>(() =>
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
    const reset = useResetRecoilState(similarityParameters);
    const hasSimilarityKeys =
      useRecoilValue(availableSimilarityKeys(modal)).length > 0;

    const choices = useRecoilValue(currentSimilarityKeys(modal));
    const sortBySimilarity = useSortBySimilarity();
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
              color: theme.font,
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
                    close();
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
