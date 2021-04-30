import React from "react";
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
import SelectInput from "../Common/SelectInput";
import { Button } from "../FieldsSidebar";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PopoutSectionTitle } from "../utils";
import Checkbox from "../Common/Checkbox";

const getQueryIds = async (snapshot: Snapshot) => {
  const selectedLabels = await snapshot.getPromise(selectors.selectedLabelIds);
  if (selectedLabels.size) {
    return [...selectedLabels];
  }

  const selectedSamples = await snapshot.getPromise(atoms.selectedSamples);
  return [...selectedSamples];
};

const appendStage = (set, view, stage) => {
  set(selectors.view, [...view, stage]);
};

const useSortBySimilarity = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async () => {
      const view = await snapshot.getPromise(selectors.view);
      const params = await snapshot.getPromise(sortBySimilarityParameters);
      const queryIds = await getQueryIds(snapshot);
      appendStage(set, view, {
        _cls: "fiftyone.core.stages.SortBySimilarity",
        kwargs: [
          ["query_ids", queryIds],
          ["k", params.k],
          ["reverse", params.reverse],
          ["brain_key", params.brainKey],
          ["_state", null],
        ],
      });
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

const brainKeyValue = atom<string[]>({
  key: "brainKeyValue",
  default: [null],
});

const searchBrainKeyValue = atom<string>({
  key: "searchBrainKeyValue",
  default: "",
});

const availableSimilarityKeys = selectorFamily<string[], boolean>({
  key: "availableSimilarityKeys",
  get: (modal) => ({ get }) => {
    const isRoot = get(selectors.isRootView);
    const keys = get(selectors.similarityKeys);
    if (isRoot && !modal) {
      return keys.samples;
    } else if (modal) {
      const selectedLabels = get(selectors.selectedLabels);
      const fields = Object.values(selectedLabels).reduce((acc, { field }) => {
        acc.add(field);
        return acc;
      }, new Set<string>());
      if (fields.size === 1) {
        return keys.patches[fields.values()[0]] ?? [];
      }
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
      brainKey: get(brainKeyValue)[0],
      reverse: get(reverseValue),
    };
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

    return (
      <Popout modal={modal} bounds={bounds}>
        <PopoutSectionTitle>Sort by similarity</PopoutSectionTitle>
        {hasSimilarityKeys ? (
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
            <SelectInput
              choices={choices}
              radio={true}
              values={brainKey}
              setValues={setBrainKey}
            />
            {brainKey && (
              <>
                <PopoutSectionTitle></PopoutSectionTitle>
                <Button
                  text={"Apply"}
                  onClick={() => {
                    close();
                    sortBySimilarity();
                  }}
                  style={{
                    margin: "0.25rem -0.5rem",
                    paddingLeft: "2.5rem",
                    height: "2rem",
                    borderRadius: 0,
                  }}
                ></Button>
              </>
            )}
          </>
        ) : (
          <ActionOption
            text={"No runs available"}
            title={"No similarity runs are available"}
            href={"https://fiftyone.ai"}
          />
        )}
      </Popout>
    );
  }
);

export default SortBySimilarity;
