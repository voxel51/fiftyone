import {
  Checkbox as VoodoCheckbox,
  cssVar,
  LoadingDots,
  Size,
} from "@voxel51/voodo";
import React, { useMemo } from "react";
import { ReverbValueReadOnly, constSelector } from "@fiftyone/reverb";
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
  loading?: boolean;
  value: boolean;
  setValue?: (value: boolean) => void;
  count?: number | ReverbValueReadOnly<number>;
  subcountAtom?: ReverbValueReadOnly<number>;
  disabled?: boolean;
  muted?: boolean;
  forceColor?: boolean;
  formatter?: (value: T | undefined) => string | null | undefined;
}

const StyledCheckbox = styled(ItemAction)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 0.5rem;
  margin: 0;
  min-height: 28px;
  box-sizing: border-box;
  padding: 0;
  border-radius: 4px;
`;

function Checkbox<T>({
  color,
  name,
  loading,
  value,
  setValue,
  subcountAtom,
  count,
  disabled,
  forceColor,
  muted,
  formatter,
}: CheckboxProps<T>) {
  color = color ?? cssVar.color.brand.primary;
  const props = useHighlightHover(disabled);
  const [text, coloring] = getValueString(formatter ? formatter(name) : name);

  const countAtom = useMemo(
    () => (typeof count === "number" ? constSelector(count) : (count ?? null)),
    [count],
  );

  return (
    <div title={text}>
      <StyledCheckbox
        {...props}
        data-cy={`checkbox-${text}`}
        style={{ ...props.style, cursor: muted ? "not-allowed" : "pointer" }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          !disabled && !muted && setValue && setValue(!value);
        }}
      >
        {!disabled && (
          <VoodoCheckbox
            checked={value}
            title={text}
            size={Size.Sm}
            disabled={muted}
            style={
              {
                "--color-content-interactive-primary-default": color,
                "--color-content-border-active": color,
              } as React.CSSProperties
            }
            // the row's click toggles; the box toggles itself, by click or key
            onClick={(e) => e.stopPropagation()}
            onChange={(checked) => setValue?.(checked)}
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
          {loading && <LoadingDots />}
          {countAtom && (
            <SuspenseEntryCounts
              countAtom={countAtom}
              subcountAtom={subcountAtom}
            />
          )}
        </NameAndCountContainer>
      </StyledCheckbox>
    </div>
  );
}

export default Checkbox;
