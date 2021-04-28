import React, { useState } from "react";
import { useSpring } from "react-spring";
import { selector, useRecoilCallback, useRecoilValue } from "recoil";

import Popout from "./Popout";
import { ActionOption } from "./Common";
import { SwitcherDiv, SwitchDiv } from "./utils";
import * as atoms from "../../recoil/atoms";
import { useTheme } from "../../utils/hooks";

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

const useSortBySimilarity = () => {
  return useRecoilCallback(({ snapshot, set }) => (key: string) => {}, []);
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
}

const SortBySimilarity = React.memo(
  ({ bounds, close }: SortBySimilarityProps) => {
    const theme = useTheme();
    const [patches, setPatches] = useState(true);

    const patchesProps = useSpring({
      borderBottomColor: patches ? theme.brand : theme.backgroundDark,
      cursor: patches ? "default" : "pointer",
    });
    const samplesProps = useSpring({
      borderBottomColor: patches ? theme.backgroundDark : theme.brand,
      cursor: patches ? "pointer" : "default",
    });
    return (
      <Popout modal={false} bounds={bounds}>
        <SwitcherDiv>
          <SwitchDiv
            style={samplesProps}
            onClick={() => patches && setPatches(false)}
          >
            Sample Keys
          </SwitchDiv>
          <SwitchDiv
            style={patchesProps}
            onClick={() => !patches && setPatches(true)}
          >
            Patches Keys
          </SwitchDiv>
        </SwitcherDiv>
        {!patches && <SampleKeys close={close} />}
        {patches && <PatchesKeys close={close} />}
      </Popout>
    );
  }
);

export default SortBySimilarity;
