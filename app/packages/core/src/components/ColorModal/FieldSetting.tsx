import React, { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { TwitterPicker } from "react-color";
import { cloneDeep } from "lodash";
import * as fos from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  Field,
  FLOAT_FIELD,
  getColor,
  INT_FIELD,
  NOT_VISIBLE_LIST,
  STRING_FIELD,
  VALID_KEYPOINTS,
  VALID_MASK_TYPES,
} from "@fiftyone/utilities";
import AttributeColorSetting from "./colorPalette/AttributeColorSetting";
import Input from "../Common/Input";
import Checkbox from "../Common/Checkbox";

import ColorAttribute from "./controls/ColorAttribute";
import ShuffleColor from "./controls/RefreshColor";
import ModeControl from "./controls/ModeControl";
import {
  FieldCHILD_STYLE,
  FieldColorSquare,
  FieldTextField,
  PickerWrapper,
  SectionWrapper,
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
  const setting = (customizedColorSettings ?? []).find((x) => x.field == path!);
  const [state, setState] = useState({ useLabelColors: true });

  const { setColorScheme } = fos.useSessionColorScheme();
  const coloring = useRecoilValue(fos.coloring(false));
  const color = getColor(colorPool, coloring.seed, path);

  const defaultColor =
    coloring.pool[Math.floor(Math.random() * coloring.pool.length)];
  const expandedPath = useRecoilValue(fos.expandPath(path!));
  const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];

  const isMaskType =
    field.embeddedDocType &&
    VALID_MASK_TYPES.some((x) => field.embeddedDocType?.includes(x));
  const isNoShowType = NOT_VISIBLE_LIST.some((t) => field?.ftype?.includes(t));
  const isTypeSupported = !isMaskType && !isNoShowType;

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
    const setting = (customizedColorSettings ?? [])?.find(
      (x) => x.field == path!
    );
    const copy = cloneDeep(customizedColorSettings) ?? [];
    if (!setting) {
      const defaultSetting = {
        field: path!,
        useFieldColor: false,
        fieldColor: color,
        attributeForColor: colorFields.some(
          (f) => f.path?.includes("label") || f.name == "label"
        )
          ? "label"
          : undefined,
        labelColors: [{ name: "", color: defaultColor }],
      } as fos.CustomizeColor;
      const newSetting = [...copy, defaultSetting];
      setColorScheme(colorPool, newSetting, false);
    }
  }, [path, customizedColorSettings]);

  return (
    <div style={{ margin: "1rem" }}>
      <ModeControl />
      {coloring.by == "field" && (
        <div style={{ margin: "1rem" }}>
          <ShuffleColor />
          <Checkbox
            name={`Use specific color for ${field.name} field`}
            value={Boolean(setting?.useFieldColor)}
            setValue={(v: boolean) => {
              const newSetting = cloneDeep(customizedColorSettings ?? []);
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
      {coloring.by == "value" && isTypeSupported && (
        <div>
          <form
            style={{ display: "flex", flexDirection: "column", margin: "1rem" }}
          >
            {/* set the attribute used for color */}
            {path && field.embeddedDocType && (
              <ColorAttribute fields={colorFields} />
            )}
            {/* set attribute value - color */}
            <Checkbox
              name={`Assign color based on selected color attribute's values`}
              value={state.useLabelColors}
              setValue={(v: boolean) => {
                const newSetting = cloneDeep(customizedColorSettings ?? []);
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

      {coloring.by == "value" && !isTypeSupported && (
        <div>
          Color by attribute is not supported for this field type at the moment.
        </div>
      )}
    </div>
  );
};

export default FieldSetting;
