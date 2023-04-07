import { Radio as MaterialRadio } from "@mui/material";
import { animated } from "@react-spring/web";
import React, { useLayoutEffect } from "react";
import styled from "styled-components";

import { useTheme } from "@fiftyone/components";
import { ItemAction } from "../Actions/ItemAction";
import { useHighlightHover } from "../Actions/utils";

const StyledRadioContainer = styled.div``;

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
          <MaterialRadio
            style={{ color, padding: "0 0.5rem 0 0" }}
            checked={value === currentValue}
          />
          <RadioName>{value}</RadioName>
        </StyledRadio>
      </StyledRadioContainer>
    );
  }
);

const RadioGroupContainer = styled.div`
  overflow: auto visible;
  max-height: 165px;
  margin: 0 -0.5rem;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`;

interface RadioGroupProps {
  choices: string[];
  setValue: (value: string) => void;
  value: string;
  color?: string;
}

const RadioGroup = React.memo(
  ({ choices, color = null, value, setValue }: RadioGroupProps) => {
    const theme = useTheme();
    color = color ?? theme.primary.plainColor;

    useLayoutEffect(() => {
      choices.length >= 1 && !value && setValue(choices[0]);
    }, [value, choices]);

    if (!value) {
      return null;
    }

    return (
      <RadioGroupContainer>
        {choices.map((choice) => (
          <Radio
            value={choice}
            setValue={setValue}
            color={color}
            currentValue={value}
            key={choice}
          />
        ))}
      </RadioGroupContainer>
    );
  }
);

export default RadioGroup;
