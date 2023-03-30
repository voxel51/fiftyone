import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { TwitterPicker } from "react-color";
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
  getColor,
  INT_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import ColorPalette from "./colorPalette/ColorPalette";
import AttributeColorSetting from "./colorPalette/AttributeColorSetting";
import Input from "../Common/Input";
import { tempColorSetting } from "./utils";

const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

const FieldColorSettings = () => {
  const path = useRecoilValue(fos.colorModal)?.path!;
  const customizeColor = useRecoilValue(fos.customizeColors(path!));
  const [tempFieldColor, setTempFieldColor] = useRecoilState(tempColorSetting);

  const [showPicker, setShowPicker] = useState(false);

  const coloring = useRecoilValue(fos.coloring(false));
  const color = getColor(coloring.pool, coloring.seed, path);

  const initialColor =
    customizeColor?.fieldColor ?? tempFieldColor?.fieldColor ?? color;

  const [fieldColor, setFieldColor] = useState(initialColor);

  const onChangeColor = (color) => {
    setFieldColor(color.hex);
    setTempFieldColor((prev) => ({
      ...prev,
      field: path,
      fieldColor: color.hex,
    }));
  };

  const colorContainer: React.RefObject<HTMLDivElement> = React.createRef();
  const toggleColorPicker = (e) => {
    if (e.target.id == "color-square") {
      setShowPicker(!showPicker);
    }
  };
  const hideColorPicker = (e) => {
    if (
      e.target.id != "twitter-color-container" &&
      !e.target.id.includes("input")
    ) {
      setShowPicker(false);
    }
  };

  return (
    <div style={{ height: "calc( 350px - 6rem )", overflow: "auto" }}>
      <Text>Customize field color:</Text>
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
          {showPicker && (
            <PickerWrapper
              id="twitter-color-container"
              onBlur={hideColorPicker}
              visible={showPicker}
              tabIndex={0}
              ref={colorContainer}
            >
              <TwitterPicker
                color={fieldColor}
                colors={coloring.pool}
                onChange={onChangeColor}
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
  );
};

const AttributeValueSettings = () => {
  const field = useRecoilValue(fos.colorModal);
  const path = field?.path;

  const customizeColor = useRecoilValue(fos.customizeColors(path!));
  const [tempAttributeSetting, setTempAttributeSetting] =
    useRecoilState(tempColorSetting);

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

  const coloring = useRecoilValue(fos.coloring(false));

  const [checkbox1, setCheckbox1] = useState(false);
  const [checkbox2, setCheckbox2] = useState(false);
  const [checkbox3, setCheckbox3] = useState(false);

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

  const handleCheckboxChange = (event) => {
    switch (event.target.name) {
      case "opacity":
        setCheckbox1(event.target.checked);
        if (!event.target.checked) {
          setTempAttributeSetting((prev) => ({
            ...prev,
            attributeForOpacity: undefined,
          }));
        }
        break;
      case "colorPool":
        setCheckbox2(event.target.checked);
        if (!event.target.checked) {
          setTempAttributeSetting((prev) => ({
            ...prev,
            colors: coloring.pool as string[],
          }));
        }
        break;
      case "valueColor":
        setCheckbox3(event.target.checked);
        if (!event.target.checked) {
          setTempAttributeSetting((prev) => ({
            ...prev,
            valueColors: undefined,
          }));
        }
        break;
      default:
        break;
    }
  };

  const hasDefaultColorPool = (colors: string[] | undefined) => {
    if (!colors || colors.length == 0) return true;
    if (colors.join("") === coloring.pool.join("")) return true;
    return false;
  };

  const hasDefaultLabelColor = (
    labelColors: { name: string; color: string }[] | undefined
  ) => {
    if (!labelColors || labelColors.length == 0) return true;
    if (labelColors.length == 1 && labelColors[0].name == "") return true;
    return false;
  };

  // if customizeColor has settings about attribute for color field, tempFieldColor should copy the settings, otherwise, initialize the settings
  useEffect(() => {
    if (customizeColor?.attributeForColor) {
      setTempAttributeSetting(customizeColor);
      // update checkbox status based on exisiting settings
      setCheckbox1(!!customizeColor.attributeForOpacity);
      setCheckbox2(!hasDefaultColorPool(customizeColor.colors));
      setCheckbox3(!hasDefaultLabelColor(customizeColor.labelColors));
    } else {
      setTempAttributeSetting({
        field: path!,
        attributeForColor:
          colorAttributeOptions.find((x) => x.label === "label")?.value ??
          undefined,
        attributeForOpacity:
          opacityAttributeOptions.find((x) => x.label === "confidence")
            ?.value ?? undefined,
        colors: coloring.pool as string[],
        labelColors: [
          {
            name: "",
            color:
              coloring.pool[Math.floor(Math.random() * coloring.pool.length)],
          },
        ],
      });
    }
  }, []);

  if (!field || !path) return <div></div>;

  return (
    <div style={{ height: "calc( 80vh - 6rem)", overflow: "scroll" }}>
      <form
        style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
      >
        {/* set the attribute used for color */}
        <FormControl key="color">
          <InputLabel key="dropdown-attribute">
            Select attribute for annotation color
          </InputLabel>
          <Select
            labelId="dropdown-attribute"
            key="select-attribute-dropdown"
            value={tempAttributeSetting?.attributeForColor ?? ""}
            onChange={handleDropdownChange}
            MenuProps={{ style: { zIndex: 9999999 } }}
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
        {/* set the attribute used for opacity */}
        <FormControlLabel
          key="opacity"
          control={
            <Checkbox
              checked={checkbox1}
              onChange={handleCheckboxChange}
              name="opacity"
              disabled={opacityAttributeOptions.length === 0}
            />
          }
          label="Set up object boxes opacity"
        />
        {checkbox1 && (
          <FormControl style={CHILD_STYLE} key="dropdown-opacity">
            <InputLabel key="dropdown-opacity-attribute">
              Select attribute for opacity
            </InputLabel>
            <Select
              labelId="dropdown-opacity-attribute"
              key="select-opacity-attribute-dropdown"
              value={tempAttributeSetting?.attributeForOpacity ?? ""}
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
          label="Overwrite color pool"
          key="color-pool"
        />
        {checkbox2 && <ColorPalette style={CHILD_STYLE} />}
        <FormControlLabel
          control={
            <Checkbox
              checked={checkbox3}
              onChange={handleCheckboxChange}
              name="valueColor"
            />
          }
          label="Assign specfic color to attribute value"
          key="value-color"
        />
        {checkbox3 && <AttributeColorSetting style={CHILD_STYLE} />}
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

const Text = styled.div`
  margin: 1rem;
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
