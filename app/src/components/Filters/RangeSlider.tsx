import React, { useContext, useEffect, useState } from "react";
import numeral from "numeral";
import styled, { ThemeContext } from "styled-components";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { Checkbox, FormControlLabel } from "@material-ui/core";

import { Slider as SliderUnstyled } from "@material-ui/core";

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
  padding: 1.5rem 0.5rem 0.5rem;
  line-height: 1.9rem;
`;

const SliderStyled = styled(SliderUnstyled)`
  && {
    color: ${({ theme }) => theme.brand};
    margin: 0 1rem 0 0.8rem;
    height: 3px;
  }

  .rail {
    height: 7px;
    border-radius: 6px;
  }

  .track {
    height: 7px;
    border-radius: 6px;
    background: ${({ theme }) => theme.brand};
  }

  .thumb {
    height: 1rem;
    width: 1rem;
    border-radius: 0.5rem;
    background: ${({ theme }) => theme.brand};
    box-shadow: none;
    color: transparent;
  }

  .thumb:hover,
  .thumb:focus,
  .thumb.active {
    box-shadow: none;
  }

  .valueLabel {
    margin-top: 0.5rem;
    font-weight: bold;
    font-family: "Palanquin", sans-serif;
    font-size: 14px;
    padding: 0.2rem;
    border-radius: 6rem;
    color: transparent;
    transform: none !important;
    margin-top: -4px;
  }

  .valueLabel > span > span {
    color: transparent;
  }

  .valueLabel > span > span {
    color: ${({ theme }) => theme.font};
    background: ${({ theme }) => theme.backgroundDark};
    border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  }
`;

const formatNumeral = (int) => (v) => numeral(v).format(int ? "0a" : "0.00a");

type SliderValue = number | undefined;

export type Range = [SliderValue, SliderValue];

type BaseSliderProps = {
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  value: Range | number;
  onChange: (e: Event, v: Range | number) => void;
  onCommit: (e: Event, v: Range | number) => void;
  persistValue?: boolean;
  showBounds?: boolean;
  int?: boolean;
};

const BaseSlider = React.memo(
  ({
    boundsAtom,
    color,
    int = false,
    onChange,
    onCommit,
    persistValue = true,
    showBounds = true,
    value,
  }: BaseSliderProps) => {
    const theme = useContext(ThemeContext);
    const bounds = useRecoilValue(boundsAtom);
    const [clicking, setClicking] = useState(false);

    const hasBounds = bounds.every((b) => b !== null);

    if (!hasBounds) {
      return null;
    }
    let step = (bounds[1] - bounds[0]) / 100;
    if (int) {
      step = Math.ceil(step);
    }

    const formatter = formatNumeral(int);

    return (
      <SliderContainer style={showBounds ? {} : { padding: 0 }}>
        {showBounds && formatter(bounds[0])}
        <SliderStyled
          onMouseDown={() => setClicking(true)}
          onMouseUp={() => setClicking(false)}
          value={value}
          onChange={onChange}
          onChangeCommitted={onCommit}
          classes={{
            thumb: "thumb",
            track: "track",
            rail: "rail",
            active: "active",
            valueLabel: "valueLabel",
          }}
          valueLabelFormat={formatter}
          aria-labelledby="slider"
          valueLabelDisplay={clicking || persistValue ? "on" : "off"}
          max={bounds[1]}
          min={bounds[0]}
          step={step}
          theme={{ ...theme, brand: color }}
        />
        {showBounds && formatter(bounds[1])}
      </SliderContainer>
    );
  }
);

type SliderProps = {
  valueAtom: RecoilState<SliderValue>;
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  persistValue?: boolean;
  showBounds?: boolean;
  int?: boolean;
};

export const Slider = ({ valueAtom, ...rest }: SliderProps) => {
  const [value, setValue] = useRecoilState(valueAtom);
  const [localValue, setLocalValue] = useState<SliderValue>(null);
  useEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  return (
    <BaseSlider
      {...rest}
      onChange={(_, v) => setLocalValue(v)}
      onCommit={(_, v) => setValue(v)}
      value={localValue}
    />
  );
};

type RangeSliderProps = {
  valueAtom: RecoilState<Range>;
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  int?: boolean;
};

export const RangeSlider = ({ valueAtom, ...rest }: RangeSliderProps) => {
  const [value, setValue] = useRecoilState(valueAtom);
  const [localValue, setLocalValue] = useState<Range>([null, null]);
  useEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  return (
    <BaseSlider
      {...rest}
      onChange={(_, v: Range) => setLocalValue(v)}
      onCommit={(_, v) => setValue(v)}
      value={[...localValue]}
    />
  );
};

const NamedRangeSliderContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedRangeSliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const RangeSliderContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
`;

type NamedProps = {
  valueAtom: RecoilState<Range>;
  boundsAtom: RecoilValueReadOnly<Range>;
  hasNoneAtom: RecoilValueReadOnly<boolean>;
  noneAtom: RecoilState<boolean>;
  name: string;
  valueName: string;
  int?: boolean;
  color: string;
};

const isDefaultRange = (range, bounds) => {
  return bounds.every((b, i) => b === range[i]);
};

export const NamedRangeSlider = React.memo(
  React.forwardRef(
    (
      {
        name,
        valueName,
        hasNoneAtom,
        noneAtom,
        ...rangeSliderProps
      }: NamedProps,
      ref
    ) => {
      const theme = useContext(ThemeContext);
      const hasNone = useRecoilValue(hasNoneAtom);
      const [includeNone, setIncludeNone] = useRecoilState(noneAtom);
      const [range, setRange] = useRecoilState(rangeSliderProps.valueAtom);
      const bounds = useRecoilValue(rangeSliderProps.boundsAtom);
      const hasDefaultRange = isDefaultRange(range, bounds);
      const hasBounds = bounds.every((b) => b !== null);
      const isSingleValue = hasBounds && bounds[0] === bounds[1];

      return (
        <NamedRangeSliderContainer ref={ref}>
          <NamedRangeSliderHeader>
            {name}
            {!hasDefaultRange || !includeNone ? (
              <a
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {
                  setRange(bounds);
                  setIncludeNone(true);
                }}
              >
                reset
              </a>
            ) : null}
          </NamedRangeSliderHeader>
          <RangeSliderContainer>
            {isSingleValue && (
              <span
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0 6px",
                }}
              >
                Only one non-none value exists:{" "}
                <span style={{ color: theme.font }}>
                  {bounds[0].toLocaleString()}
                </span>
              </span>
            )}
            {hasBounds && !isSingleValue && (
              <RangeSlider {...rangeSliderProps} />
            )}
            {hasNone && hasDefaultRange && (
              <FormControlLabel
                label={
                  <div style={{ lineHeight: "20px", fontSize: 14 }}>
                    Exclude{" "}
                    <code style={{ color: rangeSliderProps.color }}>None</code>
                  </div>
                }
                control={
                  <Checkbox
                    checked={!includeNone}
                    onChange={() => setIncludeNone(!includeNone)}
                    style={{
                      padding: "0 5px",
                      color: rangeSliderProps.color,
                    }}
                  />
                }
              />
            )}
          </RangeSliderContainer>
        </NamedRangeSliderContainer>
      );
    }
  )
);

export default RangeSlider;
