import React, { useEffect, useRef } from "react";
import { Slider } from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import { autoFocus, getComponentProps } from "../utils";
import { useKey } from "../hooks";
import { isNumber } from "lodash";

export default function SliderView(props) {
  const { data, onChange, path, schema } = props;
  const sliderRef = useRef<HTMLInputElement>(null);
  const focus = autoFocus(props);
  const { type, min, max, multipleOf } = schema;
  const computedMin = isNumber(min) ? min : 0;
  const computedMax = isNumber(max) ? max : 100;
  const computedMultipleOf = isNumber(multipleOf)
    ? multipleOf
    : (computedMax - computedMin) / 100;

  useEffect(() => {
    if (sliderRef.current && focus) {
      sliderRef.current.querySelector("input")?.focus();
    }
  }, [sliderRef, focus]);

  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FieldWrapper {...props}>
      <Slider
        min={computedMin}
        max={computedMax}
        step={computedMultipleOf}
        key={key}
        disabled={schema.view?.readOnly}
        valueLabelDisplay="auto"
        defaultValue={data}
        onChange={(e, value: string) => {
          onChange(path, type === "number" ? parseFloat(value) : value);
          setUserChanged();
        }}
        ref={sliderRef}
        {...getComponentProps(props, "slider")}
      />
    </FieldWrapper>
  );
}
