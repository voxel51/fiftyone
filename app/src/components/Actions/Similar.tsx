import React, { useState } from "react";
import { useSpring } from "react-spring";
import { selector, Snapshot, useRecoilCallback, useRecoilValue } from "recoil";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import { SwitcherDiv, SwitchDiv } from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { useTheme } from "../../utils/hooks";
import { PopoutSectionTitle } from "../utils";

interface BrainMethod {
  method: string;
  config: {
    patches_field: string;
  };
}

interface BrainMethods {
  [key: string]: BrainMethod;
}

const similarityKeys = selector<{ patches: string[]; samples: string[] }>({
  key: "similarityKeys",
  get: ({ get }) => {
    const state = get(atoms.stateDescription);
    const brainKeys = (state?.dataset?.brain_methods || {}) as BrainMethods;
    return Object.entries(brainKeys)
      .filter(([_, { method }]) => method === "similarity")
      .reduce(
        (
          { patches, samples },
          [
            key,
            {
              config: { patches_field },
            },
          ]
        ) => {
          if (patches_field) {
            patches.push(key);
          } else {
            samples.push(key);
          }
          return { patches, samples };
        },
        { patches: [], samples: [] }
      );
  },
});

const getQueryIds = async (snapshot: Snapshot, brainKey: string) => {
  const;
};

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

const SampleKeys = ({ close }) => {
  const { samples } = useRecoilValue(similarityKeys);

  const sortBySimilarity = useSortBySimilarity();

  return (
    <>
      {samples.map((key) => {
        return (
          <ActionOption
            key={key}
            text={key}
            title={`Sort by selected with ${key} patches view`}
            onClick={() => {
              sortBySimilarity(key);
              close();
            }}
          />
        );
      })}
    </>
  );
};

const PatchesKeys = ({ close }) => {
  const { patches } = useRecoilValue(similarityKeys);

  const sortBySimilarity = useSortBySimilarity();
  return (
    <>
      {patches.map((key) => {
        return (
          <ActionOption
            key={key}
            text={key}
            title={`Sort by selected with ${key} patches view`}
            onClick={() => {
              sortBySimilarity(key);
              close();
            }}
          />
        );
      })}
    </>
  );
};

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
  ({ bounds, close }: SortBySimilarityProps) => {
    const;

    return (
      <Popout modal={false} bounds={bounds}>
        <PopoutSectionTitle>Sort by similarity</PopoutSectionTitle>
      </Popout>
    );
  }
);

export default SortBySimilarity;
