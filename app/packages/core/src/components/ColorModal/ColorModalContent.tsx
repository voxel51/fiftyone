import React, { Fragment, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Checkbox,
  FormControlLabel,
} from "@material-ui/core";

import * as fos from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import ColorPalette from "./colorPalette/ColorPalette";
import AttributeColorSetting from "./colorPalette/AttributeColorSetting";

const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

const FieldColorSettings = () => {
  return <div></div>;
};

const AttributeValueSettings = () => {
  const [dropdownValue, setDropdownValue] = useState(null);
  const [opacityDropdownValue, setOpacityDropdownValue] = useState(null);

  const [checkbox1, setCheckbox1] = useState(false);
  const [checkbox2, setCheckbox2] = useState(false);
  const [checkbox3, setCheckbox3] = useState(false);

  const handleDropdownChange = (event) => {
    setDropdownValue(event.target.value);
  };
  const handleOpacityDropdownChange = (event) => {
    setOpacityDropdownValue(event.target.value);
  };

  const handleCheckboxChange = (event) => {
    switch (event.target.name) {
      case "opacity":
        setCheckbox1(event.target.checked);
        break;
      case "colorPool":
        setCheckbox2(event.target.checked);
        break;
      case "valueColor":
        setCheckbox3(event.target.checked);
        break;
      default:
        break;
    }
  };

  const field = useRecoilValue(fos.colorModal);
  if (!field) return <div></div>;

  const expandedPath = useRecoilValue(fos.expandPath(field!.path!));
  const colorAttributeOptions = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: VALID_COLOR_ATTRIBUTE_TYPES,
    })
  )
    .filter((field) => field.dbField !== "tags")
    .map((field) => ({ value: field.path, label: field.name }));

  const opacityAttributeOptions = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: FLOAT_FIELD,
    })
  ).map((field) => ({ value: field.path, label: field.name }));

  return (
    <div>
      <form
        style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
      >
        {/* set the attribute used for color */}
        <FormControl>
          <InputLabel id="dropdown-attribute">
            Select attribute for color
          </InputLabel>
          <Select
            labelId="dropdown-attribute"
            id="select-attribute-dropdown"
            value={dropdownValue}
            onChange={handleDropdownChange}
            MenuProps={{ style: { zIndex: 9999999 } }}
            required
          >
            {colorAttributeOptions.map((option) => {
              return (
                <MenuItem value={option.value ?? ""}>{option.label}</MenuItem>
              );
            })}
          </Select>
        </FormControl>
        {/* set the attribute used for opacity */}
        <FormControlLabel
          control={
            <Checkbox
              checked={checkbox1}
              onChange={handleCheckboxChange}
              name="opacity"
              disabled={opacityAttributeOptions.length === 0}
            />
          }
          label="Set up Object boxes opacity"
        />
        {checkbox1 && (
          <FormControl>
            <InputLabel id="dropdown-opacity-attribute">
              Select attribute for opacity
            </InputLabel>
            <Select
              labelId="dropdown-opacity-attribute"
              id="select-opacity-attribute-dropdown"
              value={opacityDropdownValue}
              onChange={handleOpacityDropdownChange}
              MenuProps={{ style: { zIndex: 9999999 } }}
            >
              {opacityAttributeOptions.map((option, idx) => {
                return (
                  <MenuItem
                    value={option.value ?? ""}
                    key={`opacity-option-${idx}`}
                  >
                    {option.label}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        )}
        {/* set colors to use to replace the color pool*/}
        <FormControlLabel
          control={
            <Checkbox
              checked={checkbox2}
              onChange={handleCheckboxChange}
              name="colorPool"
            />
          }
          label="Overwrite Color Pool"
        />
        {checkbox2 && <ColorPalette />}
        <FormControlLabel
          control={
            <Checkbox
              checked={checkbox3}
              onChange={handleCheckboxChange}
              name="valueColor"
            />
          }
          label="Assign specfic color to attribute value"
        />
        {checkbox3 && <AttributeColorSetting />}
      </form>
    </div>
  );
};

const ColorModalContent: React.FunctionComponent = () => {
  const field = useRecoilValue(fos.colorModal);
  const colorBy = useRecoilValue(fos.coloring(false)).by;

  if (!field) {
    return null;
  }

  const shouldSetAttributeValueColor =
    field.embeddedDocType && colorBy === "value";

  return (
    <div>
      {shouldSetAttributeValueColor && <AttributeValueSettings />}
      {!shouldSetAttributeValueColor && <FieldColorSettings />}
    </div>
  );
};

export default ColorModalContent;
