import React, { useLayoutEffect } from "react";
import {
  atom,
  selector,
  selectorFamily,
  Snapshot,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import Input from "../Common/Input";
import { Button } from "../FieldsSidebar";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PopoutSectionTitle } from "../utils";
import Checkbox from "../Common/Checkbox";
import RadioGroup from "../Common/RadioGroup";
import { useTheme } from "../../utils/hooks";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";
import { SORT_BY_SIMILARITY } from "../../utils/links";
import { samples } from "../Flashlight";

export const similaritySorting = atom<boolean>({
  key: "similaritySorting",
  default: false,
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
  const isPatches = await snapshot.getPromise(selectors.selectedLabelIds);

  if (isPatches) {
    if (selectedSamples.size) {
      return [...selectedSamples].map(
        (id) => samples.get(id).sample[labels_field]._id
      );
    }

    const { sample } = await snapshot.getPromise(atoms.modal);
    return sample[labels_field]._id;
  }

  return [...selectedSamples];
};

const useSortBySimilarity = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async () => {
      const params = await snapshot.getPromise(sortBySimilarityParameters);
      const queryIds = await getQueryIds(snapshot, params.brainKey);
      set(similaritySorting, true);
      set(atoms.modal, null);

      socket.send(
        packageMessage("save_filters", {
          add_stages: [
            {
              _cls: "fiftyone.core.stages.SortBySimilarity",
              kwargs: [
                ["query_ids", queryIds],
                ["k", params.k],
                ["reverse", params.reverse],
                ["brain_key", params.brainKey],
                ["_state", null],
              ],
            },
          ],
        })
      );
    },
    []
  );
};

const kValue = atom<number>({
  key: "kValue",
  default: null,
});

const reverseValue = atom<boolean>({
  key: "reverseValue",
  default: false,
});

const brainKeyValue = atom<string>({
  key: "brainKeyValue",
  default: null,
});

const searchBrainKeyValue = atom<string>({
  key: "searchBrainKeyValue",
  default: "",
});

const availableSimilarityKeys = selectorFamily<string[], boolean>({
  key: "availableSimilarityKeys",
  get: (modal) => ({ get }) => {
    const isPatches = get(selectors.isPatchesView);
    const keys = get(selectors.similarityKeys);
    if (!isPatches && !modal) {
      return keys.samples;
    } else if (!modal) {
      return keys.patches.reduce((acc, [key, field]) => {
        if (get(selectors.labelPaths).includes(field)) {
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

interface SortBySimilarityParameters {
  k: number | null;
  reverse: boolean;
  brainKey: string;
}

const sortBySimilarityParameters = selector<SortBySimilarityParameters>({
  key: "sortBySimilarityParameters",
  get: ({ get }) => {
    return {
      k: get(kValue),
      brainKey: get(brainKeyValue),
      reverse: get(reverseValue),
    };
  },
});

const sortType = selectorFamily<string, boolean>({
  key: "sortBySimilarityType",
  get: (modal) => ({ get }) => {
    const isRoot = get(selectors.isRootView);
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
    const [brainKey, setBrainKey] = useRecoilState(brainKeyValue);
    const hasSimilarityKeys =
      useRecoilValue(availableSimilarityKeys(modal)).length > 0;

    const choices = useRecoilValue(currentSimilarityKeys(modal));
    const sortBySimilarity = useSortBySimilarity();
    const [reverse, setReverse] = useRecoilState(reverseValue);
    const [k, setK] = useRecoilState(kValue);
    const type = useRecoilValue(sortType(modal));
    const theme = useTheme();

    useLayoutEffect(() => {
      choices.choices.length === 1 && setBrainKey(choices.choices[0]);
    }, [choices]);

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
              value={k === null ? "" : String(k)}
              setter={(value) => {
                setK(value === "" ? null : Number(value));
              }}
            />
            <Checkbox name={"reverse"} value={reverse} setValue={setReverse} />
            <PopoutSectionTitle style={{ fontSize: 14 }}>
              Brain key
            </PopoutSectionTitle>
            <RadioGroup
              choices={choices.choices}
              value={brainKey}
              setValue={setBrainKey}
            />
            {brainKey && (
              <>
                <PopoutSectionTitle></PopoutSectionTitle>
                <Button
                  text={"Apply"}
                  title={`Sort by similarity to the selected ${type}`}
                  onClick={() => {
                    close();
                    sortBySimilarity();
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
      </Popout>
    );
  }
);

export default SortBySimilarity;
