import React from "react";
import {
  Radio as MaterialRadio,
  RadioGroup as MaterialRadioGroup,
} from "@material-ui/core";
import {
  RecoilState,
  RecoilValue,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { animated } from "react-spring";
import styled from "styled-components";

import { ItemAction, useHighlightHover } from "../Actions/utils";
import { useTheme } from "../../utils/hooks";

interface CheckboxProps {
  color?: string;
  name: string;
  valueAtom: RecoilState<boolean>;
}

const StyledRadioContainer = styled.div`
  margin: 0 -0.5rem 0.25rem -0.5rem;
`;

const StyledRadio = animated(styled(ItemAction)`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  margin: 0;
`);

const RadioName = styled.div`
  text-overflow: ellipses;
  font-weight: bold;
  flex-grow: 1;
`;

interface RadioProps {
  value: string;
  setValue: (value: string) => void;
}

const Radio = React.memo(({ value, setValue }: RadioProps) => {
  const props = useHighlightHover(false);
  return (
    <StyledRadioContainer>
      <StyledRadio {...props} onClick={() => setValue(value)}>
        <MaterialRadio />
        <RadioName>{value}</RadioName>
      </StyledRadio>
    </StyledRadioContainer>
  );
});

interface RadioGroupProps {
  choicesAtom: RecoilValue<string[]>;
  valueAtom: RecoilState<string>;
  color?: string;
}

const RadioGroup = React.memo(
  ({ choicesAtom, color = null, valueAtom }: RadioGroupProps) => {
    const choices = useRecoilValue(choicesAtom);
    const [value, setValue] = useRecoilState(valueAtom);
    const theme = useTheme();
    color = color ?? theme.brand;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      setValue((event.target as HTMLInputElement).value);
    };

    return (
      <MaterialRadioGroup value={value} onChange={handleChange}>
        {choices.map((choice) => (
          <Radio value={choice} setValue={setValue} />
        ))}
      </MaterialRadioGroup>
    );
  }
);

export default RadioGroup;
