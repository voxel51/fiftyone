import React from "react";
import styled from "styled-components";
import { Slider as SLiderUnstyled } from "@material-ui/core";
import { useRecoilState } from "recoil";
import { Machine } from "xstate";
import { useMachine } from "@xstate/react";
import { Checkbox, FormControlLabel } from "@material-ui/core";

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

const RangeSlider = ({ atom, ...rest }) => {
  const [value, setValue] = useRecoilState(atom);

  const handleChange = (event: any, newValue: number | number[]) => {
    setValue(newValue as number[]);
  };

  return (
    <SliderContainer>
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
  background: ${({ theme }) => theme.backgroundLight};
  padding: 0.5rem;
  font-weight: bold;
  font-size: 1rem;
`;

const classFilterMachine = Machine({
  id: "classFilter",
  initial: "init",
  context: {
    error: undefined,
    classes: [],
    inputValue: "",
    availableClasses: null,
  },
  states: {
    init: {},
  },
});

const ClassInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  font-size: 1rem;
  line-height: 1.2rem;
  font-weight: bold;
  padding: 0.5rem;

  &:focus {
    outline: none;
  }
`;

const ClassCloud = styled.div``;

const ClassButton = styled.button``;

const ClassFilterContainer = styled.div`
  margin-bottom: 0.5rem;
`;

const ClassFilter = () => {
  const [state, send] = useMachine(classFilterMachine);

  const { inputValue } = state.context;
  return (
    <ClassFilterContainer>
      <ClassInput value={inputValue} placeholder={"+ add label"} />
    </ClassFilterContainer>
  );
};

const ConfidenceContainer = styled.div``;

const Filter = ({ name }) => {
  return (
    <FilterDiv>
      <div>Labels</div>
      <ClassFilter />
      <div>Confidence</div>
      <RangeSlider
        atom={filterLabelConfidenceRange(name)}
        title={"Confidence"}
        min={0}
        max={1}
        step={0.01}
      />
      <FormControlLabel
        label={<div>Show no confidence</div>}
        control={<Checkbox checked={true} />}
      />
    </FilterDiv>
  );
};

export default Filter;
