import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { TwitterPicker } from "react-color";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  FormControlLabel,
} from "@material-ui/core";
import Divider from "@mui/material/Divider";
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
import { colorBlindFriendlyPalette, tempColorSetting } from "./utils";
import Checkbox from "../Common/Checkbox";

const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

const FieldSetting: React.FC = ({}) => {
  const field = useRecoilValue(fos.activeColorField) as Field;
  const path = field.path;
  const customizeColor = useRecoilValue(fos.customizeColors(path!));
  const [tempAttributeSetting, setTempAttributeSetting] =
    useRecoilState(tempColorSetting);
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
    (o) => o.value === tempAttributeSetting?.attributeForColor
  )?.label;

  const coloring = useRecoilValue(fos.coloring(false));
  const pool = coloring.pool.filter(
    (c) => !fullSetting?.map((x) => x.fieldColor).includes(c)
  );
  const color = getColor(pool, coloring.seed, path ?? "");

  const [checkbox1, setCheckbox1] = useState(false);
  const [checkbox2, setCheckbox2] = useState(false);
  const [showFieldPicker, setShowFieldPicker] = useState(false);

  const handleDropdownChange = (event) => {
    setTempAttributeSetting((prev) => ({
      ...prev,
      attributeForColor: event.target.value,
    }));
  };
  const handleOpacityDropdownChange = (event) => {
    setTempAttributeSetting((prev) => ({
      ...prev,
      attributeForOpacity: event.target.value,
    }));
  };

  //   const hasDefaultColorPool = (colors: string[] | undefined) => {
  //     if (!colors || colors.length == 0) return true;
  //     if (colors.join("") === coloring.pool.join("")) return true;
  //     return false;
  //   };

  const hasDefaultLabelColor = (
    labelColors: { name: string; color: string }[] | undefined
  ) => {
    if (!labelColors || labelColors.length == 0) return true;
    if (labelColors.length == 1 && labelColors[0].name == "") return true;
    return false;
  };

  const initialColor =
    customizeColor?.fieldColor ?? tempAttributeSetting?.fieldColor ?? color;
  const [fieldColor, setFieldColor] = useState(initialColor);
  const onChangeFieldColor = (color) => {
    setFieldColor(color.hex);
    setTempAttributeSetting((prev) => ({
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
    colorBlindFriendlyPalette[Math.floor(Math.random() * coloring.pool.length)];

  // if customizeColor has settings about attribute for color field, tempFieldColor should copy the settings, otherwise, initialize the settings
  useEffect(() => {
    if (customizeColor?.attributeForColor) {
      setTempAttributeSetting(customizeColor);
      // update checkbox status based on exisiting settings
      setCheckbox1(!!customizeColor.attributeForOpacity);
      setCheckbox2(!hasDefaultLabelColor(customizeColor.labelColors));
    } else {
      setTempAttributeSetting({
        field: path!,
        attributeForColor:
          colorAttributeOptions.find((x) => x.label === "label")?.value ??
          undefined,
        attributeForOpacity:
          opacityAttributeOptions.find((x) => x.label === "confidence")
            ?.value ?? undefined,
        labelColors: [
          {
            name: "",
            color:
              colorBlindFriendlyPalette[
                Math.floor(Math.random() * coloring.pool.length)
              ],
          },
        ],
      });
    }
  }, []);

  return (
    <div style={{ margin: "1rem" }}>
      Color by field settings
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
      <Divider></Divider>
      <Text>Color by value settings</Text>
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
            value={tempAttributeSetting?.attributeForColor ?? ""}
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
          value={checkbox2}
          setValue={(v: boolean) => {
            setCheckbox2(v);
            !v &&
              setTempAttributeSetting((prev) => ({
                ...prev,
                labelColors: [{ name: "", color: defaultColor }],
              }));
          }}
        />
        {checkbox2 && <AttributeColorSetting style={CHILD_STYLE} />}
        {/* set the attribute used for opacity */}
        <Checkbox
          name={`Select attribute for opacity`}
          value={checkbox1}
          setValue={(v: boolean) => {
            setCheckbox1(v);
            !v &&
              setTempAttributeSetting((prev) => ({
                ...prev,
                attributeForOpacity: undefined,
              }));
          }}
        />
        {checkbox1 && (
          <FormControl style={CHILD_STYLE} key="dropdown-opacity">
            <InputLabel key="dropdown-opacity-attribute" style={FONT_STYLE}>
              Select attribute for opacity
            </InputLabel>
            <Select
              labelId="dropdown-opacity-attribute"
              key="select-opacity-attribute-dropdown"
              value={tempAttributeSetting?.attributeForOpacity ?? ""}
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
  );
};

export default FieldSetting;

const Text = styled.div`
  margin-top: 2rem;
  font-family: "Palanquin", sans-serif;
  font-weight: "500";
`;

const CheckboxText = styled.div`
  font-family: "Palanquin", sans-serif;
  font-weight: "500" !important;
  fontstyle: bold;
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
