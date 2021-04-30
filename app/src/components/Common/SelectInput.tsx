import React, { Suspense, useMemo, useState } from "react";
import { animated } from "react-spring";
import styled from "styled-components";
import { CircularProgress } from "@material-ui/core";
import uuid from "uuid-v4";

import Input from "./Input";
import RadioGroup from "./RadioGroup";
import Checkbox from "./Checkbox";

const SelectInputDiv = styled.div``;

interface SelectInputProps {
  choices: { total: number; choices: string[] };
  radio?: boolean;
  values: string[];
  setValues: (values: string[]) => void;
  placeholder?: string;
  color?: string;
  limit?: number;
}

const SelectInputContainer = React.memo(
  ({
    color,
    values,
    choices,
    radio = false,
    setValues,
    limit = 15,
  }: SelectInputProps) => {
    const { total, choices: choicesList } = choices;

    if (total == choicesList.length && radio) {
      return (
        <RadioGroup
          color={color}
          value={values[0]}
          choices={choicesList}
          setValue={(value) => setValues([value])}
        />
      );
    }

    if (total === choicesList.length) {
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
