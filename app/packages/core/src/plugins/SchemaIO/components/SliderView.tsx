import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography,
} from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import { autoFocus, getComponentProps } from "../utils";
import { useKey } from "../hooks";
import { isNumber } from "lodash";

type ValueFormat = "float" | "percentage";
type LabelPosition = "top" | "left";

function valueLabelFormat(
  value: number,
  min: number,
  max: number,
  valueFormat: ValueFormat,
  valuePrecision = 0
) {
  if (valueFormat === "percentage") {
    const finalValue = (((value - min) / (max - min)) * 100).toFixed();
    return `${finalValue}${"%"}`;
  }
  return `${value.toFixed(valuePrecision)}`;
}

const formatValue = (
  value: number,
  min: number,
  max: number,
  valueFormat: ValueFormat,
  valuePrecision = 0
): string => {
  if (valueFormat === "percentage") {
    return (((value - min) / (max - min)) * 100).toFixed();
  } else {
    return value.toFixed(valuePrecision);
  }
};

export default function SliderView(props) {
  const { data, onChange, path, schema } = props;

  const sliderRef = useRef<HTMLInputElement>(null);
  const focus = autoFocus(props);

  const {
    type,
    min: schemaMin,
    max: schemaMax,
    multipleOf: schemaMultipleOf,
    view,
  } = schema;
  const {
    min: viewMin,
    max: viewMax,
    defaultValue = 0,
    valueFormat = "percentage",
    valuePrecision = 2,
    variant = null,
    valueLabelDisplay = "on",
    labelPosition = "left",
    label = "Threshold",
    viewMultipleOf = null,
  } = view;
  const [title, _] = useState(label);
  console.log("label", title);

  const multipleOf = viewMultipleOf || schemaMultipleOf;

  const [min, max] = [
    isNumber(viewMin) ? viewMin : schemaMin,
    isNumber(viewMax) ? viewMax : schemaMax,
  ];
  console.log("view", min, max);

  const computedMin = isNumber(min) ? min : 0;
  const computedMax = isNumber(max) ? max : 100;

  const computedMultipleOf = isNumber(multipleOf)
    ? multipleOf
    : (computedMax - computedMin) / 100;
  console.log("computedMultipleOf", computedMultipleOf);

  useEffect(() => {
    if (sliderRef.current && focus) {
      sliderRef.current.querySelector("input")?.focus();
    }
  }, [sliderRef, focus]);

  const [key, setUserChanged] = useKey(path, schema, data, true);
  const [unit, setUnit] = useState<string>(valueFormat);

  console.log("data", data);

  const [minText, setMinText] = useState(
    formatValue(data?.[0] || min, min, max, unit as ValueFormat, valuePrecision)
  );
  const [maxText, setMaxText] = useState(
    formatValue(data?.[1] || max, min, max, unit as ValueFormat, valuePrecision)
  );

  if (labelPosition === "left") {
    delete props?.schema?.view?.label;
  }

  console.log("props", props);

  return (
    <Box padding={2} py={4}>
      <FieldWrapper {...props}>
        <Grid container spacing={2} alignItems="center">
          {labelPosition === "left" && title && (
            <Grid item sx={{ width: "100px", overflow: "hidden" }}>
              <Typography
                noWrap
                sx={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  width: "100%",
                }}
              >
                {title}
              </Typography>
            </Grid>
          )}

          <Grid item xs>
            <Slider
              min={computedMin}
              max={computedMax}
              step={computedMultipleOf}
              key={key}
              disabled={schema.view?.readOnly}
              valueLabelDisplay={valueLabelDisplay}
              value={data || defaultValue}
              valueLabelFormat={(value: number) =>
                valueLabelFormat(
                  value,
                  min,
                  max,
                  unit as ValueFormat,
                  valuePrecision
                )
              }
              getAriaValueText={(value: number) =>
                valueLabelFormat(
                  value,
                  min,
                  max,
                  unit as ValueFormat,
                  valuePrecision
                )
              }
              onChange={(_, value: string) => {
                onChange(
                  path,
                  type === "number" ? parseFloat(value) : value,
                  schema
                );
                setUserChanged();

                if (variant === "withInputs") {
                  isNumber(min) &&
                    setMinText(
                      formatValue(
                        parseFloat(value[0]),
                        min,
                        max,
                        unit as ValueFormat,
                        valuePrecision
                      )
                    );
                  setMaxText(
                    formatValue(
                      parseFloat(value[1]),
                      min,
                      max,
                      unit as ValueFormat,
                      valuePrecision
                    )
                  );
                }
              }}
              ref={sliderRef}
              {...getComponentProps(props, "slider")}
            />
          </Grid>
          {variant === "withInputs" && (
            <Grid container justifyContent="space-between" pl={1}>
              <Grid item pl="100px">
                <TextField
                  label="Min"
                  size="small"
                  variant="outlined"
                  value={minText}
                  onChange={(e) => {
                    const value = e.target.value;
                    console.log("asdasd", value, minText);
                    if (!value && !!minText) {
                      setMinText(null);
                    } else if (unit === "percentage") {
                      const percentageValue = parseInt(value);
                      console.log("percentageValue", percentageValue);
                      if (
                        !isNaN(percentageValue) &&
                        percentageValue >= 0 &&
                        percentageValue <= 100
                      ) {
                        setMinText(percentageValue.toFixed());
                      }
                    } else if (unit === "flt") {
                      const floatValue = parseFloat(value);
                      if (!isNaN(floatValue)) {
                        setMinText(value);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      let finalValue = e.target.value;

                      if (!finalValue) {
                        return;
                      }

                      if (unit === "percentage") {
                        finalValue =
                          ((computedMax - computedMin) / 100) * finalValue;
                      }

                      onChange(
                        path,
                        [parseFloat(finalValue), parseFloat(data?.[1] || max)],
                        schema
                      );
                    }
                  }}
                  sx={{ width: "70px" }}
                />
                <FormControl variant="outlined">
                  <Select
                    size="small"
                    labelId="dropdown-label"
                    value={unit}
                    onChange={(event: React.ChangeEvent<{ value: string }>) => {
                      setUnit(event.target.value);
                      setMinText(
                        formatValue(
                          data?.[0] || min,
                          min,
                          max,
                          event.target.value as ValueFormat,
                          valuePrecision
                        )
                      );
                      setMaxText(
                        formatValue(
                          data?.[1] || max,
                          min,
                          max,
                          event.target.value as ValueFormat,
                          valuePrecision
                        )
                      );
                    }}
                    label="Select Option"
                  >
                    <MenuItem value="percentage">%</MenuItem>
                    <MenuItem value="flt">flt</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item>
                <TextField
                  label="Max"
                  size="small"
                  variant="outlined"
                  value={maxText}
                  onChange={(e) => {
                    const value = e.target.value;
                    console.log(value, maxText);
                    if (!value && !!maxText) {
                      setMaxText(null);
                    } else if (unit === "percentage") {
                      const percentageValue = parseInt(value);
                      if (
                        !isNaN(percentageValue) &&
                        percentageValue >= 0 &&
                        percentageValue <= 100
                      ) {
                        setMaxText(percentageValue.toFixed());
                      }
                    } else if (unit === "flt") {
                      const floatValue = parseFloat(value);
                      if (!isNaN(floatValue)) {
                        setMaxText(value);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      let finalValue = e.target.value;

                      if (!finalValue) {
                        return;
                      }

                      if (unit === "percentage") {
                        finalValue =
                          ((computedMax - computedMin) / 100) * finalValue;
                      }

                      onChange(
                        path,
                        [parseFloat(data?.[0] || min), parseFloat(finalValue)],
                        schema
                      );
                    }
                  }}
                  sx={{ width: "70px" }}
                />
                <FormControl variant="outlined">
                  <Select
                    size="small"
                    labelId="dropdown-label"
                    value={unit}
                    onChange={(event: React.ChangeEvent<{ value: string }>) => {
                      setUnit(event.target.value);
                      setMinText(
                        formatValue(
                          data?.[0] || min,
                          min,
                          max,
                          event.target.value as ValueFormat,
                          valuePrecision
                        )
                      );
                      setMaxText(
                        formatValue(
                          data?.[1] || max,
                          min,
                          max,
                          event.target.value as ValueFormat,
                          valuePrecision
                        )
                      );
                    }}
                    label="Select Option"
                  >
                    <MenuItem value="percentage">%</MenuItem>
                    <MenuItem value="flt">flt</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          )}
        </Grid>
      </FieldWrapper>
    </Box>
  );
}
