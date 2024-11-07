import { Box, Grid, Slider, TextField, Typography } from "@mui/material";
import { isNumber, isEqual } from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useKey } from "../hooks";
import { autoFocus, getComponentProps } from "../utils";
import FieldWrapper from "./FieldWrapper";
import { ViewPropsType } from "../utils/types";

type ValueFormat = "" | "%";

const valueLabelFormat = (
  value: number,
  min: number,
  max: number,
  valueFormat: ValueFormat,
  valuePrecision = 6,
  skipUnit = true
) => {
  const formattedValue =
    valueFormat === "%"
      ? (((value - min) / (max - min)) * 100).toFixed()
      : value.toFixed(valuePrecision);

  return skipUnit ? formattedValue : `${formattedValue} ${valueFormat}`;
};

interface SliderInputFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  UnitSelection: React.ReactNode;
}

const SliderInputField: React.FC<SliderInputFieldProps> = ({
  label,
  value,
  onChange,
  onKeyDown,
  UnitSelection,
}) => (
  <Grid item>
    <TextField
      label={label}
      size="small"
      variant="outlined"
      defaultValue={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      sx={{
        width: "70px",
      }}
    />
    {UnitSelection}
  </Grid>
);

export default function SliderView(props: ViewPropsType) {
  const { data, onChange, path, schema } = props;
  const sliderRef = useRef<HTMLInputElement>(null);
  const focus = autoFocus(props);

  // @NOTE: using schema min/max/viewMultipleOf is deprecated
  // in favor of using view's alternatives.
  const {
    view,
    min: schemaMin,
    max: schemaMax,
    viewMultipleOf: schemaMultipleOf,
  } = schema;

  const {
    value_label_display: valueLabelDisplay = "on",
    value_format: valueFormat = "",
    value_precision: valuePrecision = 6,
    variant = null,
    label_position: labelPosition = "left",
    label = "Threshold",
    view_multiple_of: viewMultipleOf = null,
    min: viewMin,
    max: viewMax,
  } = view;

  const isDoubleSlider = Boolean(viewMin) && Boolean(viewMax);

  const multipleOf = viewMultipleOf;
  const [min, max] = [
    isNumber(viewMin) ? viewMin : isNumber(schemaMin) ? schemaMin : 0,
    isNumber(viewMax) ? viewMax : isNumber(schemaMax) ? schemaMax : 100,
  ];

  const [key, setUserChanged] = useKey(path, schema, data, true);
  const [fieldsRevision, setFieldsRevision] = useState(0);

  const computedMultipleOf = isNumber(multipleOf)
    ? multipleOf
    : isNumber(schemaMultipleOf)
    ? schemaMultipleOf
    : (max - min) / 100;

  // if external reset happens, update the key for inputs
  useEffect(() => {
    if (isEqual(data, [min, max])) {
      return setFieldsRevision(fieldsRevision + 1);
    }
  }, [key]);

  const [unit, _] = useState<ValueFormat>(valueFormat);

  const minText = valueLabelFormat(
    data?.[0] || min,
    min,
    max,
    unit,
    valuePrecision
  );

  const maxText = valueLabelFormat(
    data?.[1] || max,
    min,
    max,
    unit,
    valuePrecision
  );

  useEffect(() => {
    if (sliderRef.current && focus) {
      sliderRef.current.querySelector("input")?.focus();
    }
  }, [focus]);

  const handleKeyDown = (e, isMin: boolean) => {
    if (e.key === "Enter") {
      const finalValue = e.target.value;
      if (!finalValue) return;

      let val = parseFloat(finalValue);
      if (unit === "%" && isMin) {
        val = min + (max - min) * (finalValue / 100);
      }
      if (unit === "%" && !isMin) {
        val = min + (max - min) * (finalValue / 100);
      }

      if (isDoubleSlider) {
        let finalMin = isMin ? val : data?.[0] || min;
        let finalMax = !isMin ? val : data?.[1] || max;

        if (finalMax <= finalMin) {
          finalMin = finalMax;
          finalMax = finalMin;
        }
        onChange(path, [finalMin, finalMax], schema);
      } else {
        // single slider
        onChange(path, val, schema);
      }
    }
  };

  const handleSliderChange = () => {
    // re-render inputs
    if (variant === "withInputs") {
      setFieldsRevision(fieldsRevision + 1);
    }
  };

  const handleSliderCommit = (_, value: number | number[]) => {
    onChange(path, value, schema);
    setFieldsRevision(fieldsRevision + 1);
  };

  if (labelPosition === "left") {
    delete props?.schema?.view?.label;
  }

  return (
    <Box padding={2} py={4}>
      <FieldWrapper {...props}>
        <Grid container spacing={2} alignItems="center">
          {labelPosition === "left" && label && (
            <Grid item sx={{ width: "100px", overflow: "hidden" }}>
              <Typography noWrap sx={{ textOverflow: "ellipsis" }}>
                {label}
              </Typography>
            </Grid>
          )}
          <Grid item xs>
            <Slider
              min={min}
              max={max}
              step={computedMultipleOf}
              key={key}
              disabled={schema.view?.readOnly}
              valueLabelDisplay={valueLabelDisplay}
              defaultValue={data}
              valueLabelFormat={(value) =>
                valueLabelFormat(value, min, max, unit, valuePrecision, false)
              }
              onChange={handleSliderChange}
              onChangeCommitted={handleSliderCommit}
              ref={sliderRef}
              {...getComponentProps(props, "slider")}
            />
          </Grid>
          {variant === "withInputs" && (
            <Grid container justifyContent="space-between" pl={1}>
              <Grid item pl={labelPosition === "left" ? "100px" : "0"}>
                {isDoubleSlider && (
                  <SliderInputField
                    key={fieldsRevision}
                    label={`Min ${unit}`}
                    value={minText}
                    onKeyDown={(e) => handleKeyDown(e, true)}
                    UnitSelection={null}
                  />
                )}
              </Grid>
              <Grid item>
                <SliderInputField
                  key={fieldsRevision}
                  label={`Max ${unit}`}
                  value={maxText}
                  onKeyDown={(e) => handleKeyDown(e, false)}
                  UnitSelection={null}
                />
              </Grid>
            </Grid>
          )}
        </Grid>
      </FieldWrapper>
    </Box>
  );
}
