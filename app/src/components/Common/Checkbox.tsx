import React from "react";
import { Checkbox as MaterialCheckbox } from "@material-ui/core";
import { animated } from "react-spring";
import styled from "styled-components";

import { ItemAction, useHighlightHover } from "../Actions/utils";
import { useTheme } from "../../utils/hooks";

interface CheckboxProps {
  color?: string;
  name: string;
  value: boolean;
  setValue: (value: boolean) => void;
}

const StyledCheckboxContainer = styled.div`
  margin: 0 -0.5rem 0.25rem -0.5rem;
`;

const StyledCheckbox = animated(styled(ItemAction)`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  margin: 0;
`);

const CheckboxName = styled.div`
  text-overflow: ellipses;
  font-weight: bold;
  flex-grow: 1;
`;

const Checkbox = React.memo(
  ({ color, name, value, setValue }: CheckboxProps) => {
    const theme = useTheme();
    color = color ?? theme.brand;
    const props = useHighlightHover(false);

    return (
      <StyledCheckboxContainer>
        <StyledCheckbox {...props} onClick={() => setValue(!value)}>
          <MaterialCheckbox
            checked={value}
            title={name}
            style={{ color, padding: "0 0.5rem 0 0" }}
            onChange={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setValue(!value);
            }}
          />
          <CheckboxName>{name}</CheckboxName>
        </StyledCheckbox>
      </StyledCheckboxContainer>
    );
  }
);

export default Checkbox;
