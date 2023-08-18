import { useTheme } from "@fiftyone/components";
import { Checkbox as MaterialCheckbox } from "@mui/material";
import { animated } from "@react-spring/web";
import React, { useMemo } from "react";
import { constSelector, RecoilValueReadOnly } from "recoil";
import styled from "styled-components";
import { prettify } from "../../utils/generic";
import { ItemAction } from "../Actions/ItemAction";
import { useHighlightHover } from "../Actions/utils";
import { getValueString } from "../Filters/utils";
import { NameAndCountContainer } from "../utils";
import { SuspenseEntryCounts } from "./CountSubcount";

interface CheckboxProps<T> {
  color?: string;
  name: T;
  value: boolean;
  setValue: (value: boolean) => void;
  count?: number;
  subcountAtom?: RecoilValueReadOnly<number>;
  disabled?: boolean;
  muted?: boolean;
  forceColor?: boolean;
  formatter?: (value: T | undefined) => string | null | undefined;
}

const StyledCheckboxContainer = styled.div`
  margin: 0 -0.5rem 0 -0.5rem;
`;

const StyledCheckbox = animated(styled(ItemAction)`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  flex-wrap: nowrap;
  margin: 0;
`);

const Checkbox = <T extends unknown>({
  color,
  name,
  value,
  setValue,
  subcountAtom,
  count,
  disabled,
  forceColor,
  muted,
  formatter,
}: CheckboxProps<T>) => {
  const theme = useTheme();
  color = color ?? theme.primary.plainColor;
  const props = useHighlightHover(disabled);
  const [text, coloring] = getValueString(formatter ? formatter(name) : name);

  const countAtom = useMemo(
    () => (typeof count === "number" ? constSelector(count) : null),
    [count]
  );

  return (
    <StyledCheckboxContainer title={text}>
      <StyledCheckbox
        {...props}
        data-cy={`checkbox-${text}`}
        style={{ ...props.style, cursor: muted ? "not-allowed" : "pointer" }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          !disabled && !muted && setValue(!value);
        }}
      >
        {!disabled && (
          <MaterialCheckbox
            checked={value}
            title={text}
            style={{
              padding: "0 0.5rem 0 0",
              color: muted ? "inherit" : color,
              opacity: muted ? 0.7 : 1,
            }}
            disabled={muted}
          />
        )}

        <NameAndCountContainer>
          <span
            style={{
              color: coloring || forceColor ? color : "unset",
              opacity: muted ? 0.7 : 1,
            }}
          >
            {prettify(text)}
          </span>
          {countAtom && (
            <SuspenseEntryCounts
              countAtom={countAtom}
              subcountAtom={subcountAtom}
            />
          )}
        </NameAndCountContainer>
      </StyledCheckbox>
    </StyledCheckboxContainer>
  );
};

export default Checkbox;
