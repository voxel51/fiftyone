import React from "react";
import { Slider } from "@mui/material";
import FieldWrapper from "./FieldWrapper";

// todo
export default function SliderView(props) {
  return (
    <FieldWrapper {...props}>
      <Slider valueLabelDisplay="auto" />
    </FieldWrapper>
  );
}
