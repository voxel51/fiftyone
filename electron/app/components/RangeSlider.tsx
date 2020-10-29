import React, { useContext, useEffect, useState } from "react";
import styled, { ThemeContext } from "styled-components";
import { RecoilState, useRecoilState, useRecoilValue } from "recoil";
import { Checkbox, FormControlLabel } from "@material-ui/core";

import { Slider as SliderUnstyled } from "@material-ui/core";

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
  padding: 1.5rem 0.5rem 0.5rem;
  line-height: 1.9rem;
`;

const Slider = styled(SliderUnstyled)`
  && {
    color: ${({ theme }) => theme.brand};
    margin: 0 1rem 0 0.8rem;
    height: 3px;
  }

  .rail {
    height: 7px;
    border-radius: 6px;
    background: ${({ theme }) => theme.backgroundLight};
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

type RangeValue = number | undefined;

export type Range = [RangeValue, RangeValue];

type Props = {
  rangeAtom: RecoilState<Range>;
  boundsAtom: RecoilState<Range>;
  maxMin?: number;
  minMax?: number;
};

const RangeSlider = ({ rangeAtom, boundsAtom, maxMin, minMax }: Props) => {
  const [value, setValue] = useRecoilState<Range>(rangeAtom);
  const bounds = useRecoilValue<Range>(boundsAtom);
  const [localValue, setLocalValue] = useState<Range>([null, null]);
  useEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  const hasBounds = bounds.every((b) => b !== null);
  const hasValue = value.every((v) => v !== null);
  const stretchedBounds = [
    maxMin < bounds[0] ? maxMin : bounds[0],
    minMax > bounds[1] ? minMax : bounds[1],
  ];
  return hasBounds && hasValue ? (
    <SliderContainer>
      {stretchedBounds[0].toFixed(2)}
      <Slider
        value={localValue.map((i) => (i ? Number(i.toFixed(2)) : i))}
        onChange={(_, v: Range) =>
          setLocalValue(v.map((i) => (i ? Number(i.toFixed(2)) : i)))
        }
        onChangeCommitted={(_, v: Range) => {
          setValue([...v]);
        }}
        classes={{
          thumb: "thumb",
          track: "track",
          rail: "rail",
          active: "active",
          valueLabel: "valueLabel",
        }}
        aria-labelledby="range-slider"
        valueLabelDisplay={"on"}
        max={Number(stretchedBounds[1].toFixed(2))}
        min={Number(stretchedBounds[0].toFixed(2))}
        step={(stretchedBounds[1] - stretchedBounds[0]) / 100}
      />
      {stretchedBounds[1].toFixed(2)}
    </SliderContainer>
  ) : null;
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
  rangeAtom: RecoilState<Range>;
  boundsAtom: RecoilState<Range>;
  includeNoneAtom: RecoilState<boolean>;
  maxMin?: number;
  minMax?: number;
  name: string;
  valueName: string;
  color: string;
};

const getMinAndMax = (bounds, minMax, maxMin) => {
  const min =
    maxMin !== undefined && maxMin < bounds[0] && bounds[1] !== bounds[0]
      ? maxMin
      : bounds[0];
  const max =
    minMax !== undefined && minMax > bounds[1] && bounds[1] !== bounds[0]
      ? minMax
      : bounds[1];
  return { min, max };
};

const isDefaultRange = (range, bounds) => {
  return bounds.every((b, i) => b === range[i]);
};

export const NamedRangeSlider = React.forwardRef(
  (
    {
      color,
      name,
      valueName,
      includeNoneAtom,
      ...rangeSliderProps
    }: NamedProps,
    ref
  ) => {
    const theme = useContext(ThemeContext);
    const { maxMin, minMax } = rangeSliderProps;
    const [includeNone, setIncludeNone] = useRecoilState(includeNoneAtom);
    const [range, setRange] = useRecoilState(rangeSliderProps.rangeAtom);
    const bounds = useRecoilValue(rangeSliderProps.boundsAtom);

    const { min, max } = getMinAndMax(bounds, minMax, maxMin);
    const hasDefaultRange = isDefaultRange(range, [min, max]);
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
                setRange([min, max]);
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
          {hasBounds && !isSingleValue && <RangeSlider {...rangeSliderProps} />}
          <FormControlLabel
            label={
              <div style={{ lineHeight: "20px", fontSize: 14 }}>
                Show no {valueName}
              </div>
            }
            control={
              <Checkbox
                checked={includeNone}
                onChange={() => setIncludeNone(!includeNone)}
                style={{
                  padding: "0 5px",
                  color,
                }}
              />
            }
          />
        </RangeSliderContainer>
      </NamedRangeSliderContainer>
    );
  }
);

export default RangeSlider;
