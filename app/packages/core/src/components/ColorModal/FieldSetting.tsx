import * as fos from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  Field,
  INT_FIELD,
  NOT_VISIBLE_LIST,
  STRING_FIELD,
  VALID_MASK_TYPES,
  getColor,
} from "@fiftyone/utilities";
import { Divider } from "@mui/material";
import { cloneDeep } from "lodash";
import React, { useEffect, useState } from "react";
import { TwitterPicker } from "react-color";
import { useRecoilValue } from "recoil";
import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import {
  FieldCHILD_STYLE,
  FieldColorSquare,
  PickerWrapper,
  SectionWrapper,
} from "./ShareStyledDiv";
import AttributeColorSetting from "./colorPalette/AttributeColorSetting";
import ColorAttribute from "./controls/ColorAttribute";
import ModeControl from "./controls/ModeControl";
import { colorPicker } from "./colorPalette/Colorpicker.module.css";

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
  const setting = (customizedColorSettings ?? []).find((x) => x.field == path!);
  const { setColorScheme } = fos.useSessionColorScheme();
  const coloring = useRecoilValue(fos.coloring(false));
  const color = getColor(colorPool, coloring.seed, path);
  const [state, setState] = useState({
    useLabelColors: Boolean(
      setting?.labelColors && setting.labelColors.length > 0
    ),
  });
  const defaultColor =
    coloring.pool[Math.floor(Math.random() * coloring.pool.length)];
  const expandedPath = useRecoilValue(fos.expandPath(path!));
  const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

  const isMaskType =
    field.embeddedDocType &&
    VALID_MASK_TYPES.some((x) => field.embeddedDocType?.includes(x));
  const isNoShowType = NOT_VISIBLE_LIST.some((t) => field?.ftype?.includes(t));
  const isTypeValueSupported = !isMaskType && !isNoShowType;
  const isTypeFieldSupported = !isNoShowType;

  const colorFields = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: VALID_COLOR_ATTRIBUTE_TYPES,
    })
  ).filter((field) => field.dbField !== "tags");

  const onChangeFieldColor = (color) => {
    const newSetting = cloneDeep(customizedColorSettings ?? []);
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
    const setting = customizedColorSettings.find((x) => x.field === path);
    const copy = cloneDeep(customizedColorSettings) ?? [];
    if (!setting) {
      const defaultSetting = {
        field: path,
        useFieldColor: false,
        fieldColor: color,
        attributeForColor: undefined,
        labelColors: [],
      } as fos.CustomizeColor;
      const newSetting = [...copy, defaultSetting];
      setColorScheme(colorPool, newSetting, false);
    }
    setState({
      useLabelColors: Boolean(
        (setting?.labelColors && setting.labelColors.length > 0) ||
          setting?.attributeForColor
      ),
    });
  }, [path, customizedColorSettings]);

  return (
    <div>
      <ModeControl />
      <Divider />
      {coloring.by == "field" && isTypeFieldSupported && (
        <div style={{ margin: "1rem", width: "100%" }}>
          <Checkbox
            name={`Use custom color for ${field.name} field`}
            value={Boolean(setting?.useFieldColor)}
            setValue={(v: boolean) => {
              const newSetting = cloneDeep(customizedColorSettings ?? []);
              const index = newSetting.findIndex((x) => x.field === path);
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
                      className={colorPicker}
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
      {coloring.by == "field" && !isTypeFieldSupported && (
        <div>Color by field is not supported for this field type</div>
      )}
      {coloring.by == "value" && isTypeValueSupported && (
        <div>
          <form
            style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
          >
            {/* set attribute value - color */}
            <Checkbox
              name={`Use custom colors for specific field values`}
              value={state.useLabelColors}
              setValue={(v: boolean) => {
                const newSetting = cloneDeep(customizedColorSettings ?? []);
                const index = newSetting.findIndex((x) => x.field === path);
                newSetting[index].labelColors = v
                  ? [{ name: "", color: defaultColor }]
                  : [];
                if (field.embeddedDocType && !v) {
                  newSetting[index].attributeForColor = undefined;
                }
                setColorScheme(colorPool, newSetting, false);
                setState((s) => ({ ...s, useLabelColors: v }));
              }}
            />
            {/* set the attribute used for color */}
            <SectionWrapper>
              {path && field.embeddedDocType && state.useLabelColors && (
                <ColorAttribute fields={colorFields} style={FieldCHILD_STYLE} />
              )}
              <AttributeColorSetting style={FieldCHILD_STYLE} />
            </SectionWrapper>
          </form>
        </div>
      )}

      {coloring.by == "value" && !isTypeValueSupported && (
        <div>Color by value is not supported for this field type</div>
      )}
    </div>
  );
};

export default FieldSetting;
