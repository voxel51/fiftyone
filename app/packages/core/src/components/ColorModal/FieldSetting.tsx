import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { CustomizeColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import {
  COLOR_BY,
  FLOAT_FIELD,
  HEATMAP,
  NOT_VISIBLE_LIST,
  SEGMENTATION,
} from "@fiftyone/utilities";
import { Divider } from "@mui/material";
import colorString from "color-string";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TwitterPicker } from "react-color";
import {
  DefaultValue,
  selectorFamily,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import {
  FieldCHILD_STYLE,
  FieldColorSquare,
  PickerWrapper,
  SectionWrapper,
} from "./ShareStyledDiv";
import { colorPicker } from "./colorPalette/Colorpicker.module.css";
import FieldByValue from "./colorPalette/FieldByValue";
import MaskTargets from "./colorPalette/FieldsMaskTarget";
import LabelTagByValue from "./colorPalette/LabelTagByValue";
import ColorAttribute from "./controls/ColorAttribute";
import ModeControl from "./controls/ModeControl";

const fieldColorSetting = selectorFamily<
  Omit<CustomizeColorInput, "path"> | undefined,
  string
>({
  key: "fieldColorSetting",
  get:
    (path) =>
    ({ get }) => {
      const field = get(fos.colorScheme).fields?.find(
        (field) => path === field.path
      );
      if (field) {
        const { path: _, ...setting } = field;
        return setting;
      }
      return undefined;
    },
  set:
    (path) =>
    ({ set }, newSetting) => {
      set(fos.colorScheme, (current) => {
        if (!newSetting || newSetting instanceof DefaultValue) {
          return {
            ...current,
            fields: current.fields.filter((field) => field.path !== path),
          };
        }

        const setting = { ...newSetting, path };
        const fields = [...(current.fields || [])];

        let index = fields.findIndex((field) => field.path === path);

        if (index < 0) {
          index = 0;
          fields.push(setting);
        } else {
          fields[index] = setting;
        }

        return {
          ...current,
          fields,
        };
      });
    },
});

const FieldSetting = ({ path }: { path: string }) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const pickerRef = React.useRef<TwitterPicker>(null);
  const field = useRecoilValue(fos.field(path));

  if (!field) {
    throw new Error(`path ${path} is not a field`);
  }

  const { colorPool, fields } = useRecoilValue(fos.colorScheme);
  const [setting, setSetting] = useRecoilState(fieldColorSetting(path));
  const coloring = useRecoilValue(fos.coloring);

  const colorMap = useRecoilValue(fos.colorMap);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [input, setInput] = useState(setting?.fieldColor);
  const [colors, setColors] = useState(colorPool || []);

  const state = useMemo(
    () => ({
      useLabelColors: Boolean(
        setting?.valueColors && setting.valueColors.length > 0
      ),
      useFieldColor: Boolean(setting),
    }),
    [setting]
  );

  const isSegmentation = field.embeddedDocType?.includes(SEGMENTATION);

  const isHeatmap = field.embeddedDocType?.includes(HEATMAP);

  const isNoShowType = NOT_VISIBLE_LIST.some((t) => field?.ftype?.includes(t));
  const isTypeValueSupported = !isNoShowType && !(field.ftype == FLOAT_FIELD);

  const isTypeFieldSupported = !isNoShowType;

  const onChangeFieldColor = useCallback(
    (color: string) => {
      setSetting((current) => {
        if (!current) {
          throw new Error("setting not defined");
        }
        return { ...current, fieldColor: color };
      });
    },
    [setSetting]
  );

  const onValidateColor = useCallback(
    (input) => {
      if (isValidColor(input)) {
        const hexColor = colorString.to.hex(
          colorString.get(input)?.value ?? []
        );
        onChangeFieldColor(hexColor);
        setInput(hexColor);
        setColors([...new Set([...colors, hexColor])]);
      } else {
        // revert input to previous value
        setInput("invalid");
        const idx = fields.findIndex((x) => x.path == path!);
        setTimeout(() => {
          setInput(fields[idx].fieldColor || "");
        }, 1000);
      }
    },
    [fields, path, onChangeFieldColor, colors]
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

  fos.useOutsideClick(wrapperRef, () => {
    setShowFieldPicker(false);
  });

  useEffect(() => {
    setInput(setting?.fieldColor);
  }, [setting?.fieldColor]);

  return (
    <div>
      <ModeControl />
      <Divider />
      {coloring.by == COLOR_BY.FIELD &&
        isTypeFieldSupported &&
        !isHeatmap &&
        !isSegmentation && (
          <div style={{ margin: "1rem", width: "100%" }}>
            <Checkbox
              name={`Use custom color for ${path} field`}
              value={state.useFieldColor}
              setValue={(v: boolean) => {
                setSetting({
                  fieldColor: v ? colorMap(path) : undefined,
                  valueColors: setting?.valueColors,
                  colorByAttribute: setting?.colorByAttribute,
                });
                setInput(colorMap(path));
              }}
            />
            {state?.useFieldColor && input && (
              <div
                data-cy="field-color-div"
                style={{
                  margin: "1rem",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "end",
                }}
              >
                <FieldColorSquare
                  color={setting?.fieldColor || colorMap(path)}
                  onClick={toggleColorPicker}
                  id="color-square"
                >
                  {showFieldPicker && (
                    <PickerWrapper
                      id="twitter-color-container"
                      onBlur={hideFieldColorPicker}
                      visible={showFieldPicker}
                      tabIndex={0}
                      ref={wrapperRef}
                    >
                      <TwitterPicker
                        color={input ?? (setting?.fieldColor as string)}
                        colors={[...colors]}
                        onChange={(color) => setInput(color.hex)}
                        onChangeComplete={(color) => {
                          onChangeFieldColor(color.hex);
                          setColors([...new Set([...colors, color.hex])]);
                          setShowFieldPicker(false);
                        }}
                        className={colorPicker}
                        ref={pickerRef}
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
      {coloring.by == COLOR_BY.FIELD && !isTypeFieldSupported && (
        <div>Color by field is not supported for this field type</div>
      )}
      {coloring.by == COLOR_BY.VALUE &&
        isTypeValueSupported &&
        !isHeatmap &&
        !isSegmentation && (
          <div>
            <form
              style={{
                display: "flex",
                flexDirection: "column",
                margin: "1rem",
              }}
            >
              {/* set attribute value - color */}
              <Checkbox
                name={`Use custom colors for specific field values`}
                value={state.useLabelColors}
                setValue={(v: boolean) => {
                  setSetting((cur) => {
                    if (!cur) {
                      cur = { valueColors: [] };
                    }

                    if (!cur?.valueColors?.length && v) {
                      cur = {
                        ...cur,
                        valueColors: [
                          {
                            value: "",
                            color:
                              colorPool[
                                Math.floor(Math.random() * colorPool.length)
                              ],
                          },
                        ],
                      };
                    } else if (!v) {
                      cur = { ...cur, valueColors: [] };
                    }

                    return {
                      ...cur,
                      colorByAttribute:
                        field.embeddedDocType && !v
                          ? null
                          : cur.colorByAttribute,
                    };
                  });
                }}
              />
              {/* set the attribute used for color */}
              <SectionWrapper>
                {path && field.embeddedDocType && state.useLabelColors && (
                  <>
                    <ColorAttribute style={FieldCHILD_STYLE} />
                    <br />
                    <div style={FieldCHILD_STYLE}>
                      Use specific colors for the following values
                    </div>
                  </>
                )}
                <FieldByValue />
              </SectionWrapper>
            </form>
          </div>
        )}

      {coloring.by == COLOR_BY.VALUE && !isTypeValueSupported && (
        <div>Color by value is not supported for this field type</div>
      )}
      {coloring.by == COLOR_BY.INSTANCE && (
        <div>Cannot customize settings under color by instance mode</div>
      )}
    </div>
  );
};

export default FieldSetting;
