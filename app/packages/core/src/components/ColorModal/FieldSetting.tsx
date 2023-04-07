import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { TwitterPicker } from "react-color";
import { FormControl, InputLabel, MenuItem, Select } from "@material-ui/core";
import { cloneDeep } from "lodash";
import * as fos from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  Field,
  FLOAT_FIELD,
  getColor,
  INT_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import AttributeColorSetting from "./colorPalette/AttributeColorSetting";
import Input from "../Common/Input";
import { tempColorSetting } from "./utils";
import Checkbox from "../Common/Checkbox";

type Prop = {
  field: Field;
};

const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

const FieldSetting: React.FC<Prop> = ({ field }) => {
  const path = field.path;
  const customizeColor = useRecoilValue(fos.customizeColors(path!));
  const [tempSetting, setTempSetting] = useRecoilState(tempColorSetting);
  const fullSetting = useRecoilValue(fos.customizeColorSettings);
  const expandedPath = useRecoilValue(fos.expandPath(path!));
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
  const attributeFieldName = colorAttributeOptions.find(
    (o) => o.value === tempSetting?.attributeForColor
  )?.label;

  const coloring = useRecoilValue(fos.coloring(false));
  const pool = useRecoilValue(fos.colorPalette);
  const color = getColor(pool, coloring.seed, path ?? "");
  const initialColor =
    customizeColor?.fieldColor ?? tempSetting?.fieldColor ?? color;

  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [fieldColor, setFieldColor] = useState(initialColor);

  const handleDropdownChange = (event) => {
    setTempSetting((prev) => ({
      ...prev,
      attributeForColor: event.target.value,
    }));
  };
  const handleOpacityDropdownChange = (event) => {
    setTempSetting((prev) => ({
      ...prev,
      attributeForOpacity: event.target.value,
    }));
  };

  const onChangeFieldColor = (color) => {
    setFieldColor(color.hex);
    setTempSetting((prev) => ({
      ...cloneDeep(prev),
      field: path!,
      fieldColor: color.hex,
    }));
  };

  const colorContainer: React.RefObject<HTMLDivElement> = React.createRef();
  const toggleColorPicker = (e) => {
    if (e.target.id == "color-square") {
      setShowFieldPicker(!showFieldPicker);
    }
  };
  const hideFieldColorPicker = (e) => {
    if (
      e.target.id != "twitter-color-container" &&
      !e.target.id.includes("input")
    ) {
      setShowFieldPicker(false);
    }
  };

  const defaultColor =
    coloring.pool[Math.floor(Math.random() * coloring.pool.length)];

  // on initial load, if the tem
  useEffect(() => {
    debugger;
    if (!tempSetting || tempSetting.field != path) {
      // check setting to see if custom setting exists
      const setting = fullSetting.find((x) => x.field == path!);
      if (setting) {
        setTempSetting(setting);
      } else {
        setTempSetting({
          field: path!,
          fieldColor: initialColor,
          attributeForColor: "",
          attributeForOpacity: "",
          labelColors: [{ name: "", color: defaultColor }],
          useOpacity: false, // checkbox2
          useLabelColors: false, // checkbox1
        });
      }
    }
  }, [path]);

  return (
    <div style={{ margin: "1rem" }}>
      {coloring.by == "field" && (
        <div>
          Color by field mode settings
          <div
            style={{
              margin: "1rem",
              display: "flex",
              flexDirection: "row",
              alignItems: "end",
            }}
          >
            <ColorSquare
              color={fieldColor}
              onClick={toggleColorPicker}
              id="color-square"
            >
              {showFieldPicker && (
                <PickerWrapper
                  id="twitter-color-container"
                  onBlur={hideFieldColorPicker}
                  visible={showFieldPicker}
                  tabIndex={0}
                  ref={colorContainer}
                >
                  <TwitterPicker
                    color={fieldColor}
                    colors={coloring.pool}
                    onChange={onChangeFieldColor}
                    id={"twitter-color-picker"}
                  />
                </PickerWrapper>
              )}
            </ColorSquare>
            <Input
              value={fieldColor}
              setter={(v) => setFieldColor(v)}
              style={{
                width: 100,
                display: "inline-block",
                margin: 3,
              }}
            />
          </div>
        </div>
      )}
      {coloring.by == "value" && (
        <div>
          <Text>Color by value mode settings</Text>
          <form
            style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
          >
            {/* set the attribute used for color */}
            <FormControl>
              <InputLabel key="dropdown-attribute" style={FONT_STYLE}>
                Select attribute for annotation color
              </InputLabel>
              <Select
                labelId="dropdown-attribute"
                key="select-attribute-dropdown"
                value={tempSetting?.attributeForColor ?? ""}
                onChange={handleDropdownChange}
                MenuProps={{ style: { zIndex: 9999999 } }}
                style={FONT_STYLE}
                autoWidth
                required
              >
                {colorAttributeOptions.map((option, i) => {
                  return (
                    <MenuItem value={option.value ?? ""} key={`color-${i}`}>
                      {option.label}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            {/* set attribute value - color */}
            <Checkbox
              name={`Assign color for ${attributeFieldName} value`}
              value={Boolean(tempSetting?.useLabelColors)}
              setValue={(v: boolean) =>
                setTempSetting((prev) => ({
                  ...cloneDeep(prev),
                  useLabelColors: v,
                  labelColors: v
                    ? prev.labelColors
                    : [{ name: "", color: defaultColor }],
                }))
              }
            />
            {tempSetting?.useLabelColors && (
              <AttributeColorSetting style={CHILD_STYLE} />
            )}
            {/* set the attribute used for opacity */}
            <Checkbox
              name={`Select attribute for opacity`}
              value={Boolean(tempSetting?.useOpacity)}
              setValue={(v: boolean) =>
                setTempSetting((prev) => ({
                  ...cloneDeep(prev),
                  useOpacity: v,
                  attributeForOpacity: v ? prev.attributeForOpacity : undefined,
                }))
              }
            />
            {tempSetting?.useOpacity && (
              <FormControl style={CHILD_STYLE} key="dropdown-opacity">
                <InputLabel key="dropdown-opacity-attribute" style={FONT_STYLE}>
                  Select attribute for opacity
                </InputLabel>
                <Select
                  labelId="dropdown-opacity-attribute"
                  key="select-opacity-attribute-dropdown"
                  value={tempSetting?.attributeForOpacity ?? ""}
                  onChange={handleOpacityDropdownChange}
                  MenuProps={{ style: { zIndex: 9999999 } }}
                  style={FONT_STYLE}
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
          </form>
        </div>
      )}
    </div>
  );
};

export default FieldSetting;

const Text = styled.div`
  margin-top: 2rem;
  font-family: "Palanquin", sans-serif;
  font-weight: "500";
`;

const ColorSquare = styled.div<{ color: string }>`
  position: relative;
  width: 40px;
  height: 40px;
  margin: 5px;
  cursor: pointer;
  background-color: ${(props) => props.color || "#ddd"};
  display: "inline-block";
`;

const PickerWrapper = styled.div<{ visible: boolean }>`
  position: absolute;
  top: 60px;
  left: 0;
  z-index: 10001;
  visibility: ${(props) => (props.visible ? "visible" : "hidden")};
`;

const CHILD_STYLE = {
  marginLeft: "2rem",
  marginTop: "-0.25rem",
};

const FONT_STYLE = {
  fontFamily: "Palanquin, sans-serif",
  fontWeight: "500",
};
