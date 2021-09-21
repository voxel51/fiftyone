import React, { useContext, useEffect, useState } from "react";
import numeral from "numeral";
import styled, { ThemeContext } from "styled-components";
import {
  RecoilState,
  RecoilValueReadOnly,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { Slider as SliderUnstyled } from "@material-ui/core";

import Checkbox from "../Common/Checkbox";
import { PopoutSectionTitle } from "../utils";
import { Button } from "../FieldsSidebar";

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
  padding: 1.5rem 0 0.5rem;
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
  style?: React.CSSProperties;
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
    style,
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
      <SliderContainer style={style}>
        {showBounds && formatter(bounds[0])}
        <SliderStyled
          onMouseDown={() => setClicking(true)}
          onMouseUp={() => setClicking(false)}
          value={value}
          onChange={onChange}
          onChangeCommitted={(e, v) => {
            onCommit(e, v);
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
  showBounds?: boolean;
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
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
`;

type NamedProps = {
  valueAtom: RecoilState<Range>;
  boundsAtom: RecoilValueReadOnly<Range>;
  noneCountAtom: RecoilValueReadOnly<number>;
  noneAtom: RecoilState<boolean>;
  name?: string;
  int?: boolean;
  color: string;
};

const isDefaultRange = (range, bounds) => {
  return bounds.every((b, i) => b === range[i]);
};

export const NamedRangeSlider = React.memo(
  React.forwardRef(
    (
      { noneCountAtom, name, noneAtom, ...rangeSliderProps }: NamedProps,
      ref
    ) => {
      const none = useRecoilValue(noneCountAtom);
      const hasNone = none > 0;
      const [includeNone, setIncludeNone] = useRecoilState(noneAtom);
      const [range, setRange] = useRecoilState(rangeSliderProps.valueAtom);
      const bounds = useRecoilValue(rangeSliderProps.boundsAtom);
      const hasDefaultRange = isDefaultRange(range, bounds);
      const hasBounds = bounds.every((b) => b !== null);

      if (!hasBounds) {
        return null;
      }

      return (
        <NamedRangeSliderContainer ref={ref}>
          {name && <NamedRangeSliderHeader>{name}</NamedRangeSliderHeader>}
          <RangeSliderContainer>
            {hasBounds && (
              <RangeSlider {...rangeSliderProps} showBounds={false} />
            )}
            {((hasNone && hasBounds && hasDefaultRange) ||
              !hasDefaultRange) && <PopoutSectionTitle />}
            {hasNone && hasBounds && hasDefaultRange && (
              <Checkbox
                color={rangeSliderProps.color}
                name={null}
                value={includeNone}
                setValue={setIncludeNone}
                count={none}
              />
            )}
            {(!hasDefaultRange || !includeNone) && (
              <>
                <Button
                  text={"Reset"}
                  color={rangeSliderProps.color}
                  onClick={() => {
                    setRange(bounds);
                    setIncludeNone(true);
                  }}
                  style={{
                    margin: "0.25rem -0.5rem",
                    height: "2rem",
                    borderRadius: 0,
                    textAlign: "center",
                  }}
                ></Button>
              </>
            )}
          </RangeSliderContainer>
        </NamedRangeSliderContainer>
      );
    }
  )
);

export default RangeSlider;
