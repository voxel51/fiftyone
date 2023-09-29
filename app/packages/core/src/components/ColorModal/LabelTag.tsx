import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import * as fos from "@fiftyone/state";
import { getColor } from "@fiftyone/utilities";
import { Divider } from "@mui/material";
import colorString from "color-string";
import _, { cloneDeep } from "lodash";
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
import ModeControl from "./controls/ModeControl";

type State = {
  useLabelColors: boolean;
  useFieldColor: boolean;
};

const LabelTag: React.FC = () => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const pickerRef = React.useRef<TwitterPicker>(null);
  const { colorPool, fields, labelTags } = useRecoilValue(fos.colorScheme);

  const setColorScheme = fos.useSetSessionColorScheme();
  const coloring = useRecoilValue(fos.coloring(false));
  const color = getColor(colorPool, coloring.seed, "_label_tags");

  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [input, setInput] = useState(color);
  const [colors, setColors] = useState(colorPool);
  const [state, setState] = useState<State>({
    useLabelColors: Boolean(
      labelTags?.valueColors && labelTags.valueColors.length > 0
    ),
    useFieldColor: Boolean(labelTags?.fieldColor),
  });

  const defaultColor =
    coloring.pool[Math.floor(Math.random() * coloring.pool.length)];

  const onChangeFieldColor = useCallback(
    (color) => {
      const copy = cloneDeep(labelTags) ?? {};
      copy["fieldColor"] = color;
      setColorScheme(false, { colorPool, fields, labelTags: copy });
    },
    [setColorScheme, labelTags, colorPool, fields]
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

  // initialize field settings
  useEffect(() => {
    // check setting to see if custom setting exists
    const copy = cloneDeep(labelTags);
    if (!copy || _.isEmpty(copy)) {
      const defaultSetting = {
        fieldColor: color,
        valueColors: [],
      } as fos.CustomizeColor;
      setColorScheme(false, { colorPool, fields, labelTags: defaultSetting });
      setState({
        useLabelColors: Boolean(
          labelTags?.valueColors && labelTags.valueColors.length > 0
        ),
        useFieldColor: Boolean(labelTags?.fieldColor),
      });
    }
  }, [labelTags]);

  fos.useOutsideClick(wrapperRef, () => {
    setShowFieldPicker(false);
  });

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
              const copy = cloneDeep(labelTags);
              copy.fieldColor = v ? labelTags?.fieldColor : undefined;
              setColorScheme({
                colorPool,
                fields,
                labelTags: copy,
              });
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
                color={labelTags?.fieldColor ?? input}
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
                      colors={colors}
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
              name={`Use custom colors for specific field values`}
              value={state.useLabelColors}
              setValue={(v: boolean) => {
                const copy = cloneDeep(labelTags);
                copy.valueColors = v
                  ? [{ value: "", color: defaultColor }]
                  : [];

                setColorScheme({
                  colorPool,
                  fields,
                  labelTags: copy,
                });
                setState((s) => ({ ...s, useLabelColors: v }));
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
    </div>
  );
};

export default LabelTag;
