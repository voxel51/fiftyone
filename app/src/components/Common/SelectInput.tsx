import React, { Suspense, useMemo, useState } from "react";
import {
  selector,
  RecoilState,
  RecoilValueReadOnly,
  selector,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";
import { CircularProgress } from "@material-ui/core";
import uuid from "uuid-v4";

import Input from "./Input";
import RadioGroup from "./RadioGroup";
import { PopoutSectionTitle } from "../utils";
import Checkbox from "./Checkbox";

const SelectInputDiv = styled.div``;

interface SelectInputProps {
  choicesAtom?: RecoilValueReadOnly<{ hasMore: boolean; choices: string[] }>;
  radio?: boolean;
  valuesAtom: RecoilState<string[]>;
  placeholder?: string;
  color?: string;
}

const SelectInputContainer = React.memo(
  ({
    color,
    valuesAtom,
    choicesAtom = null,
    radio = false,
  }: SelectInputProps) => {
    const [id] = useState(uuid());

    const { hasMore, choices } = useRecoilValue(choicesAtom);
    const values = useRecoilValue(valuesAtom);
    console.log(values);

    const choicesArray = useMemo(() => {
      return selector({
        key: id,
        get: ({ get }) => get(choicesAtom).choices,
      });
    }, [id]);

    if (!hasMore && radio) {
      return (
        <RadioGroup
          color={color}
          valuesAtom={valuesAtom}
          choicesAtom={choicesArray}
        />
      );
    }

    if (!hasMore) {
      return (
        <>
          {choices.map((choice) => (
            <Checkbox
              color={color}
              name={choice}
              valueAtom={selector<boolean>({
                key: uuid(),
                get: ({ get }) => {
                  return get(valuesAtom).includes(choice);
                },
                set: ({ set, get }, newValue) => {
                  const newValues = new Set(get(valuesAtom));
                  if (newValue) {
                    newValues.add(choice);
                  } else {
                    newValues.delete(choice);
                  }
                  console.log(newValues, newValue);
                  set(valuesAtom, [...newValues].sort());
                },
              })}
            />
          ))}
        </>
      );
    }
  }
);

const Loading = () => {
  return <CircularProgress />;
};

const SelectInput = React.memo((props: SelectInputProps) => {
  return (
    <Suspense fallback={Loading}>
      <SelectInputContainer {...props} />
    </Suspense>
  );
});

export default SelectInput;
