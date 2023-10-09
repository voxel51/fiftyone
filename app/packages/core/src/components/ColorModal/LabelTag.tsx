import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { LabelTagColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { Divider } from "@mui/material";
import colorString from "color-string";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TwitterPicker } from "react-color";
import { DefaultValue, selector, useRecoilState, useRecoilValue } from "recoil";
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
import ModeControl from "./controls/ModeControl";

const labelTagSetting = selector<LabelTagColorInput>({
  key: "labelTagSetting",
  get: ({ get }) => {
    const labelTags = get(fos.colorScheme).labelTags;
    if (labelTags) {
      return labelTags;
    }
    return undefined;
  },
  set: ({ set }, newSetting) => {
    set(fos.colorScheme, (current) => {
      if (!newSetting || newSetting instanceof DefaultValue) {
        return {
          ...current,
          labelTags: current.labelTags,
        };
      }

      return {
        ...current,
        labelTags: newSetting,
      };
    });
  },
});

const LabelTag: React.FC = () => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const pickerRef = React.useRef<TwitterPicker>(null);

  const colorSeed = useRecoilValue(fos.colorSeed);
  const coloring = useRecoilValue(fos.coloring);
  const { colorPool, labelTags } = useRecoilValue(fos.colorScheme);
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const colorMap = useRecoilValue(fos.colorMap);
  const [setting, setSetting] = useRecoilState(labelTagSetting);

  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [input, setInput] = useState(labelTags?.fieldColor);
  const [colors, setColors] = useState(colorPool);

  const state = useMemo(
    () => ({
      useLabelColors: Boolean(
        labelTags?.valueColors && labelTags?.valueColors.length > 0
      ),
      useFieldColor: Boolean(labelTags?.fieldColor),
    }),
    [labelTags]
  );

  const onChangeFieldColor = useCallback(
    (color: string) => {
      setSetting((curr) => {
        if (!curr) {
          throw new Error("setting not defined");
        }
        return { ...curr, fieldColor: color };
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
        setTimeout(() => {
          setInput(labelTags?.fieldColor);
        }, 1000);
      }
    },
    [onChangeFieldColor, colors, labelTags?.fieldColor]
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
    setInput(labelTags?.fieldColor);
  }, [labelTags?.fieldColor]);

  return (
    <div>
      <ModeControl />
      <Divider />
      {coloring.by === "field" && (
        <div style={{ margin: "1rem", width: "100%" }}>
          <Checkbox
            name={`Use custom color for label tags field`}
            value={state.useFieldColor}
            setValue={(v: boolean) => {
              setSetting(
                v
                  ? {
                      valueColors: labelTags?.valueColors,
                      fieldColor: colorMap("label_tags"),
                    }
                  : {
                      valueColors: labelTags?.valueColors,
                      fieldColor: undefined,
                    }
              );
              setInput(colorMap("label_tags"));
            }}
          />
          {state?.useFieldColor && input && (
            <div
              data-cy="label-tags-field-color-div"
              style={{
                margin: "1rem",
                display: "flex",
                flexDirection: "row",
                alignItems: "end",
              }}
            >
              <FieldColorSquare
                color={labelTags?.fieldColor || colorMap("label_tags")}
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
                      color={input ?? labelTags?.fieldColor}
                      colors={[...colors]}
                      onChange={(color) => setInput(color.hex)}
                      onChangeComplete={(color) => {
                        onChangeFieldColor(color.hex);
                        setColors([...new Set([...colors, color.hex])]);
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

      {coloring.by === "value" && (
        <div>
          <form
            style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
          >
            {/* set attribute value - color */}
            <Checkbox
              name={`Use custom colors for specific label tag values`}
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
                  };
                });
              }}
            />
            <SectionWrapper>
              <AttributeColorSetting
                style={FieldCHILD_STYLE}
                useLabelColors={state.useLabelColors}
              />
            </SectionWrapper>
          </form>
        </div>
      )}
      {coloring.by == "instance" && (
        <div>Cannot customize settings under color by instance mode</div>
      )}
    </div>
  );
};

export default LabelTag;
