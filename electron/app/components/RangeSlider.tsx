import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { RecoilState, useRecoilState } from "recoil";

import { Slider as SliderUnstyled } from "@material-ui/core";

function valuetext(value: number[]) {
  return `${value[0]}-${value[1]}`;
}

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

type Props = {
  atom: RecoilState<[number, number]>;
  max: number;
  min: number;
  step: number;
};

const RangeSlider = ({ atom, ...rest }: Props) => {
  const [value, setValue] = useRecoilState(atom);
  const [localValue, setLocalValue] = useState([0, 1]);
  useEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  return (
    <SliderContainer>
      0
      <Slider
        value={[...localValue]}
        onChange={(_, v) => setLocalValue([...v])}
        onChangeCommitted={(e, v) => {
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
        getAriaValueText={valuetext}
        valueLabelDisplay={"on"}
        {...rest}
      />
      1
    </SliderContainer>
  );
};

export default RangeSlider;
