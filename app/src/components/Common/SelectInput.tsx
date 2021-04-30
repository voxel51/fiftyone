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
  choices: { hasMore: boolean; choices: string[] };
  radio?: boolean;
  values: string[];
  setValues: (values: string[]) => void;
  placeholder?: string;
  color?: string;
}

const SelectInputContainer = React.memo(
  ({ color, values, choices, radio = false, setValues }: SelectInputProps) => {
    const [id] = useState(uuid());

    const { hasMore, choices: choicesList } = choices;

    if (!hasMore && radio) {
      return (
        <RadioGroup
          color={color}
          value={values[0]}
          choices={choicesList}
          setValue={(value) => setValues([value])}
        />
      );
    }

    if (!hasMore) {
      console.log(choices, values);
      return (
        <>
          {choicesList.map((choice) => (
            <Checkbox
              color={color}
              name={choice}
              key={choice}
              value={values.includes(choice)}
              setValue={(value: boolean) => {
                value && setValues([...values, choice]);
              }}
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
