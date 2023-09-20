import { Slider as SliderUnstyled } from "@mui/material";
import React, { ChangeEvent, useLayoutEffect, useState } from "react";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";

import { DATE_FIELD, DATE_TIME_FIELD } from "@fiftyone/utilities";

import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { getDateTimeRangeFormattersWithPrecision } from "../../utils/generic";
import { getFormatter, getStep } from "./utils";

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
  padding: 1.5rem 0 0.5rem;
  line-height: 1.9rem;
`;

const SliderStyled = styled(SliderUnstyled)`
  && {
    color: ${({ theme }) => theme.palette.primary.plainColor};
    margin: 0 1.5rem 0 1.3rem;
    height: 8px;
  }

  align-content: center;
  display: flex;
  .rail {
    height: 8px;
    border-radius: 8px;
  }

  .track {
    height: 8px;
    border-radius: 8px;
    background: ${({ theme }) => theme.palette.primary.plainColor};
  }

  .thumb {
    height: 16px;
    width: 16px;
    border-radius: 8px;
    background: ${({ theme }) => theme.palette.primary.plainColor};
    box-shadow: none;
    color: transparent;
  }

  .thumb input {
    visibility: hidden;
  }

  .thumb:hover,
  .thumb:focus,
  .thumb.active {
    box-shadow: none;
    z-index: 1;
  }

  .valueLabel::before {
    display: none;
  }
  .valueLabel {
    width: auto;
    font-weight: bold;
    font-family: "Palanquin", sans-serif;
    font-size: 14px;
    margin-top: -100%;
    padding: 0 0.25rem;
    color: transparent;
    top: 100%;
    color: ${({ theme }) => theme.palette.text.primary};
    background: ${({ theme }) => theme.palette.background.level2};
    border: 1px solid ${({ theme }) => theme.palette.primary.plainBorder};
  }

  .valueLabel > span > span {
    text-align: center;
  }
` as typeof SliderUnstyled;

type SliderValue = number | undefined | null;

export type Range = [SliderValue, SliderValue];

type BaseSliderProps<T extends Range | number> = {
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  value: T;
  onChange: (e: ChangeEvent<{}>, v: T) => void;
  onCommit: (e: ChangeEvent<{}>, v: T) => void;
  persistValue?: boolean;
  showBounds?: boolean;
  fieldType?: string;
  showValue?: boolean;
  int?: boolean;
  style?: React.CSSProperties;
};

const BaseSlider = <T extends Range | number>({
  boundsAtom,
  color,
  fieldType,
  onChange,
  onCommit,
  persistValue = true,
  showBounds = true,
  value,
  style,
  showValue = true,
}: BaseSliderProps<T>) => {
  const theme = useTheme();
  const bounds = useRecoilValue(boundsAtom);

  const timeZone =
    fieldType && [DATE_FIELD, DATE_TIME_FIELD].includes(fieldType)
      ? useRecoilValue(fos.timeZone)
      : null;
  const [clicking, setClicking] = useState(false);

  const hasBounds = bounds.every((b) => b !== null);

  if (!hasBounds) {
    return null;
  }

  const step = getStep(bounds, fieldType);
  const { formatter, hasTitle } = getFormatter(
    fieldType,
    fieldType === DATE_FIELD ? "UTC" : timeZone,
    bounds
  );

  return (
    <>
      {hasTitle ? (
        <>
          {
            <div
              style={{
                width: "100%",
                textAlign: "center",
                padding: "0.25rem",
                color: theme.text.primary,
              }}
            >
              {getDateTimeRangeFormattersWithPrecision(
                timeZone,
                bounds[0],
                bounds[1]
              )[0]
                .format(bounds[0])
                .replaceAll("/", "-")}
            </div>
          }
        </>
      ) : null}
      <SliderContainer style={style}>
        {showBounds && formatter(bounds[0])}
        <SliderStyled
          data-cy="slider"
          onMouseDown={() => setClicking(true)}
          onMouseUp={() => setClicking(false)}
          value={value}
          onChange={(e, v) => {
            if (
              v instanceof Array
                ? v.some((i, j) => i !== value[j])
                : v !== value
            ) {
              onChange(e, v as T);
            }
          }}
          onChangeCommitted={(e, v) => {
            onCommit(e, v as T);

            setClicking(false);
          }}
          classes={{
            thumb: "thumb",
            track: "track",
            rail: "rail",
            active: "active",
            valueLabel: "valueLabel",
          }}
          valueLabelFormat={formatter}
          aria-labelledby="slider"
          valueLabelDisplay={
            (clicking || persistValue) && showValue ? "on" : "off"
          }
          max={bounds[1]}
          min={bounds[0]}
          step={step}
          theme={{
            palette: {
              ...theme,
              color,
              primary: { ...theme.primary, plainColor: color },
            },
          }}
        />
        {showBounds && formatter(bounds[1])}
      </SliderContainer>
    </>
  );
};

type SliderProps = {
  valueAtom: RecoilState<SliderValue>;
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  persistValue?: boolean;
  fieldType?: string;
  showValue?: boolean;
  showBounds?: boolean;
  onChange?: boolean;
  int?: boolean;
  style?: React.CSSProperties;
  key?: string;
};

export const Slider = ({ valueAtom, onChange, ...rest }: SliderProps) => {
  const [value, setValue] = useRecoilState(valueAtom);
  const [localValue, setLocalValue] = useState<SliderValue>(null);
  useLayoutEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  return (
    <BaseSlider
      {...rest}
      onChange={(_, v) => (onChange ? setValue(v) : setLocalValue(v))}
      onCommit={(_, v) => {
        setValue(v);
      }}
      value={localValue}
    />
  );
};

type RangeSliderProps = {
  valueAtom: RecoilState<Range>;
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  showBounds?: boolean;
  fieldType: string;
};

export const RangeSlider = ({ valueAtom, ...rest }: RangeSliderProps) => {
  const [value, setValue] = useRecoilState(valueAtom);
  const [localValue, setLocalValue] = useState<Range>([null, null]);
  useLayoutEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  return (
    <BaseSlider
      {...rest}
      onChange={(_, v: Range) => setLocalValue(v)}
      onCommit={(_, v: Range) => {
        setValue(v);
      }}
      value={[...localValue]}
    />
  );
};

export default RangeSlider;
