import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { RecoilState, useRecoilState, useRecoilValue } from "recoil";

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
  }
`;

type RangeValue = number | undefined;

export type Range = [RangeValue, RangeValue];

const valueText = (value: number) => {
  return value.toFixed(2);
};

type Props = {
  rangeAtom: RecoilState<Range>;
  boundsAtom: RecoilState<Range>;
  max: number;
  min: number;
  step: number;
};

const RangeSlider = ({ rangeAtom, boundsAtom }: Props) => {
  const [value, setValue] = useRecoilState<Range>(rangeAtom);
  const bounds = useRecoilValue<Range>(boundsAtom);
  const [localValue, setLocalValue] = useState<Range>([null, null]);
  useEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  const hasBounds =
    bounds.every((b) => b !== null) && bounds[1] - bounds[0] > 0;
  const hasValue = value.every((v) => v !== null);

  return hasBounds && hasValue ? (
    <SliderContainer>
      {bounds[0].toFixed(2)}
      <Slider
        value={[...localValue]}
        onChange={(_, v: Range) => setLocalValue([...v])}
        onChangeCommitted={(_, v: Range) => {
          setLocalValue([...v]);
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
        getAriaValueText={valueText}
        valueLabelDisplay={"on"}
        max={bounds[1]}
        min={bounds[0]}
        step={(bounds[1] - bounds[0]) / 100}
      />
      {bounds[1].toFixed(2)}
    </SliderContainer>
  ) : null;
};

export default RangeSlider;
