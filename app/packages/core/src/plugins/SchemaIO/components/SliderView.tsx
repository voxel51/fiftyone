import React from "react";
import { Slider } from "@mui/material";
import FieldWrapper from "./FieldWrapper";

export default function SliderView(props) {
  return (
    <FieldWrapper {...props}>
      <Slider valueLabelDisplay="auto" />
    </FieldWrapper>
  );
}
