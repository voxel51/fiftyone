import React from "react";
import styled from "styled-components";
import { Slider as SLiderUnstyled } from "@material-ui/core";
import { useRecoilState } from "recoil";

import { filterLabelConfidenceRange } from "../recoil/atoms";

function valuetext(value: number[]) {
  return `${value[0]}-${value[1]}`;
}

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
`;

const Slider = styled(SLiderUnstyled)`
  && {
    color: ${({ theme }) => theme.secondary};
  }
`;

const RangeSlider = ({ title, atom, ...rest }) => {
  const [value, setValue] = useRecoilState(atom);

  const handleChange = (event: any, newValue: number | number[]) => {
    setValue(newValue as number[]);
  };

  return (
    <SliderContainer>
      <span>{title}</span>
      <Slider
        value={[...value]}
        onChange={handleChange}
        valueLabelDisplay="auto"
        aria-labelledby="range-slider"
        getAriaValueText={valuetext}
        {...rest}
      />
    </SliderContainer>
  );
};

const FilterDiv = styled.div`
  width: 100%;
  display: block;
`;

const Filter = ({ name, type }) => {
  return (
    <FilterDiv>
      <RangeSlider
        atom={filterLabelConfidenceRange(name)}
        title={"Confidence"}
        min={0}
        max={1}
        step={0.01}
      />
    </FilterDiv>
  );
};

export default Filter;
