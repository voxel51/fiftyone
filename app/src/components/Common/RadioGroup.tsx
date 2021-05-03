import React, { useLayoutEffect } from "react";
import { Radio as MaterialRadio } from "@material-ui/core";
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

interface RadioGroupProps {
  choices: string[];
  setValue: (value: string) => void;
  value: string;
  color?: string;
}

const RadioGroup = React.memo(
  ({ choices, color = null, value, setValue }: RadioGroupProps) => {
    const theme = useTheme();
    color = color ?? theme.brand;

    useLayoutEffect(() => {
      choices.length >= 1 && !value && setValue(choices[0]);
    }, [value, choices]);

    if (!value) {
      return null;
    }

    return (
      <div>
        {choices.map((choice) => (
          <Radio
            value={choice}
            setValue={setValue}
            color={color}
            currentValue={value}
            key={choice}
          />
        ))}
      </div>
    );
  }
);

export default RadioGroup;
