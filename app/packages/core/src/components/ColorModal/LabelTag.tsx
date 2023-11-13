import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { LabelTagColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { COLOR_BY } from "@fiftyone/utilities";
import { Divider } from "@mui/material";
import colorString from "color-string";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TwitterPicker } from "react-color";
import { DefaultValue, selector, useRecoilState, useRecoilValue } from "recoil";
import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import {
  FieldColorSquare,
  PickerWrapper,
  SectionWrapper,
} from "./ShareStyledDiv";
import { colorPicker } from "./colorPalette/Colorpicker.module.css";
import LabelTagByValue from "./colorPalette/LabelTagByValue";
import ModeControl from "./controls/ModeControl";

const labelTagSetting = selector<LabelTagColorInput>({
  key: "labelTagSetting",
  get: ({ get }) => get(fos.colorScheme).labelTags || {},
  set: ({ set }, newSetting) => {
    set(fos.colorScheme, (current) => {
      if (!newSetting || newSetting instanceof DefaultValue) {
        throw new Error("not implemented");
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
  const coloring = useRecoilValue(fos.coloring);
  const { colorPool } = useRecoilValue(fos.colorScheme);
  const colorMap = useRecoilValue(fos.colorMap);
  const [labelTags, setSetting] = useRecoilState(labelTagSetting);

  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [input, setInput] = useState(labelTags?.fieldColor);
  const [colors, setColors] = useState(colorPool);

  const state = useMemo(
    () => ({
      useLabelColors: Boolean(labelTags?.valueColors?.length),
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
      {coloring.by === COLOR_BY.FIELD && (
        <div style={{ margin: "1rem", width: "100%" }}>
          <Checkbox
            name={`Use custom color for label tags field`}
            value={state.useFieldColor}
            setValue={(v: boolean) => {
              setSetting({
                valueColors: labelTags?.valueColors,
                fieldColor: v ? colorMap("_label_tags") : undefined,
              });
              setInput(colorMap("_label_tags"));
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
                color={labelTags?.fieldColor || colorMap("_label_tags")}
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

      {coloring.by === COLOR_BY.VALUE && (
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

                  return cur;
                });
              }}
            />
            <SectionWrapper>
              <LabelTagByValue />
            </SectionWrapper>
          </form>
        </div>
      )}
      {coloring.by == COLOR_BY.INSTANCE && (
        <div>Cannot customize settings under color by instance mode</div>
      )}
    </div>
  );
};

export default LabelTag;
