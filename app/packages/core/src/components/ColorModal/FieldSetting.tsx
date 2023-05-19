import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import * as fos from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  Field,
  INT_FIELD,
  NOT_VISIBLE_LIST,
  STRING_FIELD,
  VALID_MASK_TYPES,
  getColor,
} from "@fiftyone/utilities";
import { Divider } from "@mui/material";
import colorString from "color-string";
import { cloneDeep } from "lodash";
import React, { useCallback, useEffect, useState } from "react";
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
import { colorPicker } from "./colorPalette/Colorpicker.module.css";
import ColorAttribute from "./controls/ColorAttribute";
import ModeControl from "./controls/ModeControl";
import { resetColor } from "./ColorFooter";

type Prop = {
  field: Field;
};

type State = {
  useLabelColors: boolean;
  useFieldColor: boolean;
};

const FieldSetting: React.FC<Prop> = ({ field }) => {
  const colorContainer: React.RefObject<HTMLDivElement> = React.createRef();
  const path = field.path;
  const { colorPool, fields } = useRecoilValue(fos.sessionColorScheme);
  const setting = (fields ?? []).find((x) => x.path == path!);
  const setColorScheme = fos.useSetSessionColorScheme();
  const coloring = useRecoilValue(fos.coloring(false));
  const color = getColor(colorPool, coloring.seed, path);

  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [input, setInput] = useState(color);
  const [state, setState] = useState<State>({
    useLabelColors: Boolean(
      setting?.valueColors && setting.valueColors.length > 0
    ),
    useFieldColor: Boolean(setting?.fieldColor),
  });

  const defaultColor =
    coloring.pool[Math.floor(Math.random() * coloring.pool.length)];
  const expandedPath = useRecoilValue(fos.expandPath(path!));
  const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

  const isMaskType =
    field.embeddedDocType &&
    VALID_MASK_TYPES.some((x) => field.embeddedDocType?.includes(x));
  const isNoShowType = NOT_VISIBLE_LIST.some((t) => field?.ftype?.includes(t));
  const isTypeValueSupported =
    !isMaskType && !isNoShowType && !(field.ftype == FLOAT_FIELD);
  const isTypeFieldSupported = !isNoShowType;

  const colorFields = useRecoilValue(
    fos.fields({
      path: expandedPath,
      ftype: VALID_COLOR_ATTRIBUTE_TYPES,
    })
  ).filter((field) => field.dbField !== "tags");

  const onChangeFieldColor = useCallback(
    (color) => {
      const newSetting = cloneDeep(fields ?? []);
      const index = newSetting.findIndex((x) => x.path == path!);
      newSetting[index].fieldColor = color;
      setColorScheme(false, { colorPool, fields: newSetting });
    },
    [fields, path, setColorScheme, colorPool]
  );

  const onValidateColor = useCallback(
    (input) => {
      if (isValidColor(input)) {
        const hexColor = colorString.to.hex(colorString.get(input).value);
        onChangeFieldColor(hexColor);
        setInput(hexColor);
      } else {
        // revert input to previous value
        setInput("invalid");
        const idx = fields.findIndex((x) => x.path == path!);
        setTimeout(() => {
          setInput(fields[idx].fieldColor);
        }, 1000);
      }
    },
    [fields, path, onChangeFieldColor]
  );

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

  // initialize field settings
  useEffect(() => {
    // check setting to see if custom setting exists
    const setting = fields.find((x) => x.path === path);
    const copy = cloneDeep(fields) ?? [];
    if (!setting) {
      const defaultSetting = {
        path: path,
        fieldColor: undefined,
        colorByAttribute: undefined,
        valueColors: [],
      } as fos.CustomizeColor;
      const newSetting = [...copy, defaultSetting];
      setColorScheme(false, { colorPool, fields: newSetting });
    }
    setState({
      useLabelColors: Boolean(
        (setting?.valueColors && setting.valueColors.length > 0) ||
          setting?.colorByAttribute
      ),
      useFieldColor: Boolean(setting?.fieldColor),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, fields]);

  // on reset, sync local state input with session values
  useEffect(() => {
    setInput(color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRecoilValue(resetColor)]);

  return (
    <div>
      <ModeControl />
      <Divider />
      {coloring.by == "field" && isTypeFieldSupported && (
        <div style={{ margin: "1rem", width: "100%" }}>
          <Checkbox
            name={`Use custom color for ${field.path} field`}
            value={state.useFieldColor}
            setValue={(v: boolean) => {
              if (!v) {
                const newSetting = cloneDeep(fields ?? []);
                const index = newSetting.findIndex((x) => x.path === path);
                newSetting[index].fieldColor = v
                  ? setting?.fieldColor
                  : undefined;
                setColorScheme(false, {
                  colorPool,
                  fields: newSetting,
                });
              }
              setState((s) => ({ ...s, useFieldColor: v }));
            }}
          />
          {state?.useFieldColor && (
            <div
              style={{
                margin: "1rem",
                display: "flex",
                flexDirection: "row",
                alignItems: "end",
              }}
            >
              <FieldColorSquare
                color={setting?.fieldColor ?? input}
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
                      color={setting?.fieldColor ?? input}
                      colors={colorPool}
                      onChange={(color) => onChangeFieldColor(color.hex)}
                      className={colorPicker}
                    />
                  </PickerWrapper>
                )}
              </FieldColorSquare>
              <Input
                value={input}
                setter={(v) => setInput(v)}
                onBlur={() => onValidateColor(input)}
                onEnter={() => onValidateColor(input)}
                style={{
                  width: 120,
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
                const newSetting = cloneDeep(fields ?? []);
                const index = newSetting.findIndex((x) => x.path === path);
                newSetting[index].valueColors = v
                  ? [{ value: "", color: defaultColor }]
                  : [];
                if (field.embeddedDocType && !v) {
                  newSetting[index].colorByAttribute = undefined;
                }
                setColorScheme(false, {
                  colorPool,
                  fields: newSetting,
                });
                setState((s) => ({ ...s, useLabelColors: v }));
              }}
            />
            {/* set the attribute used for color */}
            <SectionWrapper>
              {path && field.embeddedDocType && state.useLabelColors && (
                <>
                  <ColorAttribute
                    eligibleFields={colorFields}
                    style={FieldCHILD_STYLE}
                  />
                  <br />
                  <div style={FieldCHILD_STYLE}>
                    Use specific colors for the following values
                  </div>
                </>
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
