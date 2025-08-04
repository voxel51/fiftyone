import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { DATE_FIELD, DATE_TIME_FIELD } from "@fiftyone/utilities";
import { Slider as SliderUnstyled } from "@mui/material";
import React, { ChangeEvent, useLayoutEffect, useRef, useState } from "react";
import type { RecoilState, RecoilValueReadOnly } from "recoil";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { getDateTimeRangeFormattersWithPrecision } from "../../utils/generic";
import { getFormatter, getPrecision, getStep } from "./utils";

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
  padding: 1.5rem 0 0.5rem;
  line-height: 1.9rem;
`;

interface SliderStyledProps {
  // if true, min value thumb label will appear below the slider,
  // and max value thumb label will appear above the slider
  alternateThumbLabelDirection?: boolean;
}

const SliderStyled = styled(SliderUnstyled)<SliderStyledProps>`
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

  ${({ alternateThumbLabelDirection }) =>
    alternateThumbLabelDirection &&
    `
    .valueLabel {
      font-size: 12px;
      opacity: 0.4;
      transition: opacity 0.2s ease;
    }

    .thumb[data-index="0"] .valueLabel {
      top: 56px;
    }

    .thumb:hover .valueLabel,
    .thumb:focus .valueLabel,
    .thumb.active .valueLabel {
      opacity: 1;
    }
  `}
` as typeof SliderUnstyled;

type SliderValue = number | undefined | null;

export type Range = [SliderValue, SliderValue];

type BaseSliderProps<T extends Range | number> = {
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  value: T;
  onChange: (e: ChangeEvent<{}>, v: T) => void;
  onCommit?: (e: ChangeEvent<{}>, v: T) => void;
  onMinCommit?: (v: number) => void;
  onMaxCommit?: (v: number) => void;
  persistValue?: boolean;
  showBounds?: boolean;
  fieldType?: string;
  showValue?: boolean;
  int?: boolean;
  style?: React.CSSProperties;
  alternateThumbLabelDirection?: boolean;
};

const BaseSlider = <T extends Range | number>({
  boundsAtom,
  color,
  fieldType,
  onChange,
  onCommit,
  onMinCommit,
  onMaxCommit,
  persistValue = true,
  showBounds = true,
  value,
  style,
  showValue = true,
  alternateThumbLabelDirection = false,
}: BaseSliderProps<T>) => {
  const theme = useTheme();
  const bounds = useRecoilValue(boundsAtom);

  const dirtyMin = useRef(false);
  const dirtyMax = useRef(false);

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

  const handledRange = Array.isArray(value)
    ? [value[0] ?? bounds[0], value[1] ?? bounds[1]]
    : value;

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
          value={handledRange}
          onChange={(e, v) => {
            if (
              v instanceof Array
                ? v.some((i, j) => i !== value[j])
                : v !== value
            ) {
              if (v instanceof Array) {
                dirtyMin.current = dirtyMin.current || v[0] !== value[0];
                dirtyMax.current = dirtyMax.current || v[1] !== value[1];
              }
              onChange(e, v as T);
            }
          }}
          onChangeCommitted={(e, v) => {
            if (v instanceof Array) {
              if (dirtyMin.current) {
                onMinCommit?.(v[0]);
                dirtyMin.current = false;
              }

              if (dirtyMax.current) {
                onMaxCommit?.(v[1]);
                dirtyMax.current = false;
              }
            } else {
              onCommit?.(e, v as T);
            }

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
          alternateThumbLabelDirection={alternateThumbLabelDirection}
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
} & Partial<BaseSliderProps<Range>>;

export const RangeSlider = ({
  valueAtom,
  boundsAtom,
  fieldType,
  ...rest
}: RangeSliderProps) => {
  const [value, setValue] = useRecoilState(valueAtom);
  const [localValue, setLocalValue] = useState<Range>([null, null]);
  useLayoutEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  const bounds = useRecoilValue(boundsAtom);
  // Restrict numeric precision to better represent the slider controls.
  const precision = getPrecision(fieldType, bounds);

  return (
    <BaseSlider
      {...rest}
      boundsAtom={boundsAtom}
      fieldType={fieldType}
      onChange={(_, v: Range) => setLocalValue(v)}
      onMinCommit={(v) => {
        const newMin =
          v === bounds[0] ? null : parseFloat(v.toFixed(precision));
        setValue((prev) => [newMin, prev[1]]);
      }}
      onMaxCommit={(v) => {
        const newMax =
          v === bounds[1] ? null : parseFloat(v.toFixed(precision));
        setValue((prev) => [prev[0], newMax]);
      }}
      value={[...localValue]}
    />
  );
};

export default RangeSlider;
