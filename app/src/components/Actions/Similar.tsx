import React from "react";
import { selector } from "recoil";

import * as atoms from "../../recoil/atoms";

interface SimilarProps {
  modal: boolean;
}

interface BrainMethod {
  method: string;
}

interface BrainMethods {
  [key: string]: BrainMethod;
}

const similarityKeys = selector<string>({
  key: "similarityKeys",
  get: ({ get }) => {
    const state = get(atoms.stateDescription);
    const brainKeys = (state?.dataset?.brain_methods || {}) as BrainMethods;
    return Object.fromEntries(
      Object.entries(brainKeys)
        .filter(([_, { method }]) => method === "similarity")
        .map()
    );
  },
});

const Similar = React.memo(({ modal }: SimilarProps) => {
  {
    fields.map((field) => {
      return (
        <ActionOption
          key={field}
          text={field}
          title={`Switch to ${field} patches view`}
          onClick={() => {
            close();
            toPatches(field);
          }}
        />
      );
    });
  }
});

export default Similar;
