import {
  Box,
  FormControl,
  Grid,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography,
} from "@mui/material";
import { isNumber } from "lodash";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useKey } from "../hooks";
import { autoFocus, getComponentProps } from "../utils";
import FieldWrapper from "./FieldWrapper";

type ValueFormat = "flt" | "%";

const valueLabelFormat = (
  value: number,
  min: number,
  max: number,
  valueFormat: ValueFormat,
  valuePrecision = 0,
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
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      sx={{
        width: "70px",
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      }}
      InputProps={{
        sx: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
      }}
    />
    {UnitSelection}
  </Grid>
);

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
    value_format: valueFormat = "%",
    value_label_display: valueLabelDisplay = "on",
    value_precision: valuePrecision = 2,
    variant = null,
    label_position: labelPosition = "left",
    label = "Threshold",
    viewMultipleOf = null,
  } = view;

  const multipleOf = viewMultipleOf || schemaMultipleOf;
  const [min, max] = [
    isNumber(viewMin) ? viewMin : isNumber(schemaMin) ? schemaMin : 0,
    isNumber(viewMax) ? viewMax : isNumber(schemaMax) ? schemaMax : 100,
  ];

  const computedMultipleOf = isNumber(multipleOf)
    ? multipleOf
    : (max - min) / 100;

  const [key, setUserChanged] = useKey(path, schema, data, true);
  const [unit, setUnit] = useState<ValueFormat>(valueFormat);
  const [minText, setMinText] = useState(
    valueLabelFormat(data?.[0] || min, min, max, unit, valuePrecision)
  );
  const [maxText, setMaxText] = useState(
    valueLabelFormat(data?.[1] || max, min, max, unit, valuePrecision)
  );

  useEffect(() => {
    if (sliderRef.current && focus) {
      sliderRef.current.querySelector("input")?.focus();
    }
  }, [focus]);

  const handleInputChange = (e, isMin: boolean) => {
    const value = e.target.value;

    if (!value) {
      isMin ? setMinText("") : setMaxText("");
    } else if (unit === "%") {
      const percentageValue = parseInt(value);
      if (percentageValue >= 0 && percentageValue <= 100) {
        isMin
          ? setMinText(percentageValue.toFixed())
          : setMaxText(percentageValue.toFixed());
      }
    } else {
      const floatValue = parseFloat(value);
      if (!isNaN(floatValue)) {
        isMin ? setMinText(value) : setMaxText(value);
      }
    }
  };

  const handleKeyDown = (e, isMin: boolean) => {
    if (e.key === "Enter") {
      let finalValue = e.target.value;
      if (!finalValue) return;

      if (unit === "%") {
        finalValue = ((max - min) / 100) * finalValue;
      }

      onChange(
        path,
        isMin
          ? [parseFloat(finalValue), parseFloat(data?.[1] || max)]
          : [parseFloat(data?.[0] || min), parseFloat(finalValue)],
        schema
      );
    }
  };

  // Update the UI immediately during sliding
  const handleSliderChange = (_, value: number) => {
    setMinText(valueLabelFormat(value[0], min, max, unit, valuePrecision));
    setMaxText(valueLabelFormat(value[1], min, max, unit, valuePrecision));
  };

  // Trigger actual onChange when the slider is released
  const handleSliderCommit = (_, value: number) => {
    onChange(path, value, schema);
    setUserChanged();
  };

  const UnitSelection = useMemo(
    () => (
      <FormControl variant="outlined">
        <Select
          size="small"
          value={unit}
          sx={{
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
          }}
          onChange={(e) => {
            const newUnit = e.target.value as ValueFormat;
            setUnit(newUnit);
            setMinText(
              valueLabelFormat(
                data?.[0] || min,
                min,
                max,
                newUnit,
                valuePrecision
              )
            );
            setMaxText(
              valueLabelFormat(
                data?.[1] || max,
                min,
                max,
                newUnit,
                valuePrecision
              )
            );
          }}
        >
          <MenuItem value="%">%</MenuItem>
          <MenuItem value="flt">flt</MenuItem>
        </Select>
      </FormControl>
    ),
    [data, max, min, unit, valuePrecision]
  );

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
              value={data || [min, max]}
              valueLabelFormat={(value) =>
                valueLabelFormat(value, min, max, unit, valuePrecision, false)
              }
              onChange={handleSliderChange} // Smooth UI update
              onChangeCommitted={handleSliderCommit} // Final change on slider release
              ref={sliderRef}
              {...getComponentProps(props, "slider")}
            />
          </Grid>
          {variant === "withInputs" && (
            <Grid container justifyContent="space-between" pl={1}>
              <Grid item pl={labelPosition === "left" ? "100px" : "0"}>
                <SliderInputField
                  label="Min"
                  value={minText}
                  onChange={(e) => handleInputChange(e, true)}
                  onKeyDown={(e) => handleKeyDown(e, true)}
                  UnitSelection={UnitSelection}
                />
              </Grid>
              <Grid item>
                <SliderInputField
                  label="Max"
                  value={maxText}
                  onChange={(e) => handleInputChange(e, false)}
                  onKeyDown={(e) => handleKeyDown(e, false)}
                  UnitSelection={UnitSelection}
                />
              </Grid>
            </Grid>
          )}
        </Grid>
      </FieldWrapper>
    </Box>
  );
}
