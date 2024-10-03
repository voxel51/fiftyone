import React, { useEffect, useRef, useState } from "react";
import { Grid, Slider, TextField } from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import { autoFocus, getComponentProps } from "../utils";
import { useKey } from "../hooks";
import { isNumber } from "lodash";

type valueFormat = "normal" | "percentage";
type LabelPosition = "top" | "left";

function valueLabelFormat(
  value: number,
  min: number,
  max: number,
  valueFormat: valueFormat
) {
  const unit = valueFormat === "normal" ? "" : "%";
  const finalValue = Math.round(((value - min) / (max - min)) * 100);
  return `${finalValue}${unit ?? ""}`;
}

export default function SliderView(props) {
  const { data, onChange, path, schema } = props;

  const sliderRef = useRef<HTMLInputElement>(null);
  const focus = autoFocus(props);

  // TODO: keeping min and max read from schema for backward compatibility - check with team
  const { type, min: schemaMin, max: schemaMax, multipleOf, view } = schema;
  const {
    min: viewMin,
    max: viewMax,
    defaultValue = 0,
    valueFormat = "normal",
    variant = null,
    valueLabelDisplay = "on",
    labelPosition = "top",
  } = view;

  const [min, max] = [
    isNumber(viewMin) ? viewMin : schemaMin,
    isNumber(viewMax) ? viewMax : schemaMax,
  ];
  console.log("view", min, max);

  const computedMin = isNumber(min) ? min : 0;
  const computedMax = isNumber(max) ? max : 100;

  const computedMultipleOf =
    valueFormat === "percentage"
      ? 1
      : isNumber(multipleOf)
      ? multipleOf
      : (computedMax - computedMin) / 100;

  useEffect(() => {
    if (sliderRef.current && focus) {
      sliderRef.current.querySelector("input")?.focus();
    }
  }, [sliderRef, focus]);

  const hasMin = isNumber(min);
  const [key, setUserChanged] = useKey(path, schema, data, true);
  console.log("datadata", data);
  const [minText, setMinText] = useState(data?.[0] || min);
  const [maxText, setMaxText] = useState(data?.[1] || max);

  console.log("data", defaultValue);
  return (
    <FieldWrapper {...props}>
      <Slider
        min={computedMin}
        max={computedMax}
        step={computedMultipleOf}
        key={key}
        disabled={schema.view?.readOnly}
        valueLabelDisplay={valueLabelDisplay}
        value={data || defaultValue}
        valueLabelFormat={(value: number) =>
          valueLabelFormat(value, computedMin, computedMax, valueFormat)
        }
        getAriaValueText={(value: number) =>
          valueLabelFormat(value, computedMin, computedMax, valueFormat)
        }
        onChangeCommitted={(_, value: string) => {
          onChange(path, type === "number" ? parseFloat(value) : value, schema);
          setUserChanged();
          hasMin && setMinText(value[0]);
          setMaxText(value[1]);
        }}
        ref={sliderRef}
        {...getComponentProps(props, "slider")}
      />
      {variant === "withInputs" && (
        <Grid container justifyContent="space-between">
          {hasMin && (
            <Grid item>
              <TextField
                size="small"
                variant="outlined"
                value={minText}
                onChange={(e) => {
                  setMinText(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onChange(
                      path,
                      [
                        parseFloat(e.target.value),
                        parseFloat(data?.[1] || max),
                      ],
                      schema
                    );
                  }
                }}
                sx={{ width: "70px" }}
              />
            </Grid>
          )}
          <Grid item>
            <TextField
              size="small"
              variant="outlined"
              value={maxText}
              onChange={(e) => {
                setMaxText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onChange(
                    path,
                    [parseFloat(data?.[0] || min), parseFloat(e.target.value)],
                    schema
                  );
                }
              }}
              sx={{ width: "70px" }}
            />
          </Grid>
        </Grid>
      )}
    </FieldWrapper>
  );
}
