import React, { useState } from "react";
import styled from "styled-components";
import Slider from "@material-ui/core/Slider";
import { atomFamily, useRecoilState } from "recoil";

const filterLabelConfidenceRange = atomFamily({
  key: "filterLabelConfidenceRange",
  default: [0, 1],
});

function valuetext(value: number) {
  return value;
}

const SliderContainer = styled.div``;

const RangeSlider = ({ title, atom }) => {
  const [value, setValue] = useRecoilState(atom);

  const handleChange = (event: any, newValue: number | number[]) => {
    setValue(newValue as number[]);
  };

  return (
    <SliderContainer>
      <span>{title}</span>
      <Slider
        value={value}
        onChange={handleChange}
        valueLabelDisplay="auto"
        aria-labelledby="range-slider"
        getAriaValueText={valuetext}
      />
    </SliderContainer>
  );
};

const FilterDiv = styled.div`
  width: 100%;
  display: block;
`;

const Filter = ({ name, type }) => {
  console.log(name, type);
  return (
    <FilterDiv>
      <RangeSlider atom={filterLabelConfidenceRange(name)} title={name} />
    </FilterDiv>
  );
};

export default Filter;
