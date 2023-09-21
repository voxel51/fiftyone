import React, { useEffect, useRef } from "react";
import { Slider } from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import { autoFocus, getComponentProps } from "../utils";
import { useKey } from "../hooks";

export default function SliderView(props) {
  const { onChange, path, schema } = props;
  const sliderRef = useRef<HTMLInputElement>(null);
  const focus = autoFocus(props);
  const { min = 0, max = 100, multipleOf = 1 } = schema;

  useEffect(() => {
    if (sliderRef.current && focus) {
      sliderRef.current.querySelector("input")?.focus();
    }
  }, [sliderRef, focus]);

  const [key, setUserChanged] = useKey(path, schema);

  return (
    <FieldWrapper {...props}>
      <Slider
        min={min}
        max={max}
        step={multipleOf}
        key={key}
        disabled={schema.view?.readOnly}
        valueLabelDisplay="auto"
        defaultValue={schema.default}
        onChange={(e, value) => {
          onChange(path, value);
          setUserChanged();
        }}
        ref={sliderRef}
        {...getComponentProps(props, "slider")}
      />
    </FieldWrapper>
  );
}
