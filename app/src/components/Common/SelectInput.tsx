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

const SelectInputDiv = styled.div``;

interface SelectInputProps {
  choicesAtom?: RecoilValueReadOnly<{ hasMore: boolean; choices: string[] }>;
  onChange: (selections: string[]) => void;
  radio?: boolean;
  valueAtom: RecoilState<string>;
  placeholder?: string;
}

const SelectInputContainer = React.memo(
  ({
    valueAtom,
    choicesAtom = null,
    radio = false,
    onChange,
  }: SelectInputProps) => {
    const [id] = useState(uuid());

    const { hasMore } = useRecoilValue(choicesAtom);

    const choicesArray = useMemo(() => {
      return selector({
        key: id,
        get: ({ get }) => get(choicesAtom).choices,
      });
    }, [id]);

    if (!hasMore && radio) {
      return <RadioGroup valueAtom={valueAtom} choicesAtom={choicesArray} />;
    }
    return null;
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
