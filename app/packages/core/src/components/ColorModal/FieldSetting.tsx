import React, { useEffect, useMemo, useState } from "react";
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
import { SectionWrapper, tempColorSetting } from "./utils";
import Checkbox from "../Common/Checkbox";
import OpacityAttribute from "./controls/OpacityAttribute";
import ColorAttribute from "./controls/ColorAttribute";

type Prop = {
  field: Field;
};

const FieldSetting: React.FC<Prop> = ({ field }) => {
  const colorContainer: React.RefObject<HTMLDivElement> = React.createRef();
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const path = field.path;
  const [tempSetting, setTempSetting] = useRecoilState(tempColorSetting);
  const fullSetting = useRecoilValue(fos.customizeColorSettings);
  const coloring = useRecoilValue(fos.coloring(false));
  const pool = useRecoilValue(fos.colorPalette);
  const color = getColor(pool, coloring.seed, path);
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
    setTempSetting((prev) => ({
      ...cloneDeep(prev),
      field: path!,
      fieldColor: color.hex,
    }));
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
    if (!tempSetting || tempSetting.field !== path) {
      // check setting to see if custom setting exists
      const setting = fullSetting.find((x) => x.field == path!);
      if (setting) {
        setTempSetting(setting);
      } else {
        setTempSetting({
          field: path!,
          useFieldColor: false,
          fieldColor: color,
          attributeForColor:
            colorFields.find(
              (f) => f.path?.includes("label") || f.name == "label"
            )?.path ?? undefined,
          attributeForOpacity:
            opacityFields.find(
              (f) => f.path?.includes("confidence") || f.name == "confidence"
            )?.path ?? undefined,
          labelColors: [{ name: "", color: defaultColor }],
          useOpacity: false,
          useLabelColors: false,
        });
      }
    }
  }, [path]);

  return (
    <div style={{ margin: "1rem" }}>
      {coloring.by == "field" && (
        <div>
          <Text>Settings for color by field</Text>
          <Checkbox
            name={`Use specific color for ${field.name} field`}
            value={Boolean(tempSetting?.useFieldColor)}
            setValue={(v: boolean) =>
              setTempSetting((s) => ({ ...cloneDeep(s), useFieldColor: v }))
            }
          />
          {tempSetting?.useFieldColor && (
            <div
              style={{
                margin: "1rem",
                display: "flex",
                flexDirection: "row",
                alignItems: "end",
              }}
            >
              <ColorSquare
                color={tempSetting?.fieldColor ?? color}
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
                      color={tempSetting?.fieldColor ?? color}
                      colors={coloring.pool}
                      onChange={onChangeFieldColor}
                      id={"twitter-color-picker"}
                    />
                  </PickerWrapper>
                )}
              </ColorSquare>
              <Input
                value={tempSetting?.fieldColor ?? color}
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
          <Text>Settings for color by value</Text>
          <form
            style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
          >
            {/* set the attribute used for color */}
            {path && <ColorAttribute fields={colorFields} />}
            {/* set attribute value - color */}
            <Checkbox
              name={`Assign color based on selected color attribute's values`}
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
            <SectionWrapper>
              {tempSetting?.useLabelColors && (
                <AttributeColorSetting style={CHILD_STYLE} />
              )}
            </SectionWrapper>
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
            <SectionWrapper>
              {tempSetting?.useOpacity && path && (
                <OpacityAttribute fields={opacityFields} />
              )}
            </SectionWrapper>
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

export const CHILD_STYLE = {
  marginLeft: "2rem",
  marginTop: "-0.25rem",
};

const FONT_STYLE = {
  fontFamily: "Palanquin, sans-serif",
  fontWeight: "500",
};
