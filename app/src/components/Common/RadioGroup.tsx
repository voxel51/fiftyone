import React from "react";
import { Check } from "@material-ui/icons";
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
  color: string;
  setValue: (value: string) => void;
  value: string;
  currentValue: string;
}

const Radio = React.memo(
  ({ color, currentValue, setValue, value }: RadioProps) => {
    const props = useHighlightHover(false);
    return (
      <StyledRadioContainer>
        <StyledRadio {...props} onClick={() => setValue(value)}>
          <RadioName>{value}</RadioName>
          {currentValue === value && <Check style={{ color }} />}
        </StyledRadio>
      </StyledRadioContainer>
    );
  }
);

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

    return (
      <div>
        {choices.map((choice) => (
          <Radio
            value={choice}
            setValue={setValue}
            color={color}
            currentValue={value}
          />
        ))}
      </div>
    );
  }
);

export default RadioGroup;
