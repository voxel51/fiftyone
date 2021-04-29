import React from "react";
import {
  atom,
  selector,
  selectorFamily,
  Snapshot,
  useRecoilCallback,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import Popout from "./Popout";
import Input from "../Common/Input";
import SelectInput from "../Common/SelectInput";
import { Button } from "../FieldsSidebar";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PopoutSectionTitle } from "../utils";
import Checkbox from "../Common/Checkbox";

const getQueryIds = async (snapshot: Snapshot, brainKey: string) => {};

const appendStage = (set, view, stage) => {
  set(selectors.view, [...view, stage]);
};

const useSortBySimilarity = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async (key: string) => {
      const view = await snapshot.getPromise(selectors.view);
      appendStage(set, view, {});
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

const currentSimilarityKeys = selectorFamily<
  { hasMore: boolean; choices: string[] },
  boolean
>({
  key: "currentSimilarityKeys",
  get: (modal) => ({ get }) => {
    const isRoot = get(selectors.isRootView);
    const searchBrainKey = get(searchBrainKeyValue);
    const keys = get(selectors.similarityKeys);
    let result = [];
    if (isRoot && !modal) {
      result = keys.samples.filter((k) => k.includes(searchBrainKey)).sort();
    } else {
    }
    return {
      hasMore: result.length > 10,
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

interface SortBySimilarityProps {
  modal: boolean;
  close: () => void;
  bounds?: any;
}

interface SortByKwargs {
  brainKey: string;
  k: number;
  patchesFields?: string;
  reverse?: boolean;
}

const SortBySimilarity = React.memo(
  ({ modal, bounds, close }: SortBySimilarityProps) => {
    const setBrainKeyValue = useSetRecoilState(brainKeyValue);
    const brainKey = useRecoilValue(brainKeyValue);

    return (
      <Popout modal={false} bounds={bounds}>
        <PopoutSectionTitle>Sort by similarity</PopoutSectionTitle>
        <Input
          placeholder={"k (default = None)"}
          type="int"
          valueAtom={kValue}
        />
        <Checkbox name={"reverse"} valueAtom={reverseValue} />
        <SelectInput
          choicesAtom={currentSimilarityKeys(modal)}
          radio={true}
          valueAtom={brainKeyValue}
          onChange={([value]) => setBrainKeyValue(value)}
        />
        {brainKey && (
          <>
            <PopoutSectionTitle></PopoutSectionTitle>
            <Button
              text={"Apply"}
              onClick={() => {}}
              style={{
                margin: "0.25rem -0.5rem",
                paddingLeft: "2.5rem",
                height: "2rem",
                borderRadius: 0,
              }}
            ></Button>
          </>
        )}
      </Popout>
    );
  }
);

export default SortBySimilarity;
