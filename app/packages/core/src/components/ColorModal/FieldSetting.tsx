import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { TwitterPicker } from "react-color";
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
import Checkbox from "../Common/Checkbox";
import OpacityAttribute from "./controls/OpacityAttribute";
import ColorAttribute from "./controls/ColorAttribute";
import {
  FieldCHILD_STYLE,
  FieldColorSquare,
  FieldTextField,
  PickerWrapper,
  SectionWrapper,
  Text,
} from "./ShareStyledDiv";

type Prop = {
  field: Field;
};

const FieldSetting: React.FC<Prop> = ({ field }) => {
  const colorContainer: React.RefObject<HTMLDivElement> = React.createRef();
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const path = field.path;
  const { colorPool, customizedColorSettings } = useRecoilValue(
    fos.sessionColorScheme
  );
  const setting = customizedColorSettings.find((x) => x.field == path!);
  const [state, setState] = useState({ useLabelColors: true });

  const { setColorScheme } = fos.useSessionColorScheme();
  const coloring = useRecoilValue(fos.coloring(false));
  const color = getColor(colorPool, coloring.seed, path);

  const defaultColor =
    coloring.pool[Math.floor(Math.random() * coloring.pool.length)];
  const expandedPath = useRecoilValue(fos.expandPath(path!));
  const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

  const colorFields = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: VALID_COLOR_ATTRIBUTE_TYPES,
    })
  ).filter((field) => field.dbField !== "tags");

  const opacityFields = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: FLOAT_FIELD,
    })
  );
  const onChangeFieldColor = (color) => {
    const newSetting = cloneDeep(customizedColorSettings);
    const index = newSetting.findIndex((x) => x.field == path!);
    newSetting[index].fieldColor = color;
    setColorScheme(colorPool, newSetting, false);
  };

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

  // on initial load, if the tem
  useEffect(() => {
    // check setting to see if custom setting exists
    const setting = customizedColorSettings?.find((x) => x.field == path!);
    if (!setting) {
      const defaultSetting = {
        field: path!,
        useFieldColor: false,
        fieldColor: color,
        attributeForColor:
          colorFields.find(
            (f) => f.path?.includes("label") || f.name == "label"
          )?.path ?? undefined,
        labelColors: [{ name: "", color: defaultColor }],
      } as fos.CustomizeColor;
      const newSetting = [...customizedColorSettings, defaultSetting];
      setColorScheme(colorPool, newSetting, false);
    }
  }, [path, customizedColorSettings]);

  console.info("coloring", customizedColorSettings);

  return (
    <div style={{ margin: "1rem" }}>
      {coloring.by == "field" && (
        <div>
          <FieldTextField>Settings for color by field</FieldTextField>
          <Checkbox
            name={`Use specific color for ${field.name} field`}
            value={Boolean(setting?.useFieldColor)}
            setValue={(v: boolean) => {
              const newSetting = cloneDeep(customizedColorSettings);
              const index = newSetting.findIndex((x) => x.field == path!);
              newSetting[index].useFieldColor = v;
              newSetting[index].fieldColor = v
                ? setting?.fieldColor
                : undefined;
              setColorScheme(colorPool, newSetting, false);
            }}
          />
          {setting?.useFieldColor && (
            <div
              style={{
                margin: "1rem",
                display: "flex",
                flexDirection: "row",
                alignItems: "end",
              }}
            >
              <FieldColorSquare
                color={setting?.fieldColor ?? color}
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
                      color={setting?.fieldColor ?? color}
                      colors={colorPool}
                      onChange={(color) => onChangeFieldColor(color.hex)}
                      id={"twitter-color-picker"}
                    />
                  </PickerWrapper>
                )}
              </FieldColorSquare>
              <Input
                value={setting?.fieldColor ?? color}
                setter={(v) => onChangeFieldColor(v)}
                style={{
                  width: 100,
                  display: "inline-block",
                  margin: 3,
                }}
              />
            </div>
          )}
        </div>
      )}
      {coloring.by == "value" && (
        <div>
          <FieldTextField>Settings for color by value</FieldTextField>
          <form
            style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
          >
            {/* set the attribute used for color */}
            {path && <ColorAttribute fields={colorFields} />}
            {/* set attribute value - color */}
            <Checkbox
              name={`Assign color based on selected color attribute's values`}
              value={state.useLabelColors}
              setValue={(v: boolean) => {
                const newSetting = cloneDeep(customizedColorSettings);
                const index = newSetting.findIndex((x) => x.field == path!);
                newSetting[index].labelColors = v
                  ? [{ name: "", color: defaultColor }]
                  : [];
                setColorScheme(colorPool, newSetting, false);
                setState({ useLabelColors: v });
              }}
            />
            <SectionWrapper>
              <AttributeColorSetting style={FieldCHILD_STYLE} />
            </SectionWrapper>
          </form>
        </div>
      )}
    </div>
  );
};

export default FieldSetting;
