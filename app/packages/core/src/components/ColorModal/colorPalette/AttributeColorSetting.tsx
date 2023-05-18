import * as fos from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";
import DeleteIcon from "@material-ui/icons/Delete";
import { cloneDeep } from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { ChromePicker } from "react-color";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Input from "../../Common/Input";
import { Button } from "../../utils";
import { colorPicker } from "./Colorpicker.module.css";

const RowContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  column-count: 2;
`;

const AddContainer = styled.div`
  display: flex;
  justify-content: start;
  align-items: center;
  margin-bottom: 0.5rem;
`;

const DeleteButton = styled(DeleteIcon)`
  cursor: pointer;
`;

const ColorSquare = styled.div<{ color: string }>`
  position: relative;
  width: 30px;
  height: 30px;
  margin-left: 1rem;
  margin-right: 0.5rem;
  cursor: pointer;
  background-color: ${(props) => props.color || "#ddd"};
`;

const ChromePickerWrapper = styled.div`
  position: absolute;
  top: 60px;
  left: 0;
  z-index: 10001;
`;

type ColorPickerRowProps = {
  style?: React.CSSProperties;
};

const AttributeColorSetting: React.FC<ColorPickerRowProps> = ({ style }) => {
  const pickerRef = useRef<HTMLDivElement>(null);
  const activeField = useRecoilValue(fos.activeColorField);
  const { colorPool, fields } = useRecoilValue(fos.sessionColorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const setting = fields.find((s) => s.path == (activeField as Field).path);

  const newSetting = cloneDeep(fields);
  const index = fields.findIndex((s) => s.path == (activeField as Field).path);

  const defaultValue = {
    value: "",
    color: colorPool[Math.floor(Math.random() * colorPool.length)],
  };

  const values = setting?.valueColors;

  const [showPicker, setShowPicker] = useState(
    Array(values?.length ?? 0).fill(false)
  );

  const handleAdd = () => {
    newSetting[index].valueColors = setting?.valueColors
      ? [...setting.valueColors, defaultValue]
      : [defaultValue];
    setColorScheme(false, { colorPool, fields: newSetting });
    setShowPicker([...showPicker, false]);
  };

  const handleDelete = (colorIdx: number) => {
    const labelValues = values ? [...cloneDeep(values)] : [];
    newSetting[index].valueColors = [
      ...labelValues.slice(0, colorIdx),
      ...labelValues.slice(colorIdx + 1),
    ];
    setColorScheme(false, { colorPool, fields: newSetting });
  };

  const hanldeColorChange = (color: any, colorIdx: number) => {
    setShowPicker((prev) => prev.map((_, i) => (i === colorIdx ? false : _)));
    const labelValues = values ? [...cloneDeep(values)] : [];
    labelValues[colorIdx].color = color?.hex;
    newSetting[index].valueColors = labelValues;
    setColorScheme(false, { colorPool, fields: newSetting });
  };

  const handleChange = (
    changeIdx: number,
    key: "value" | "color",
    value: string
  ) => {
    const copy = cloneDeep(fields);
    const idx = fields.findIndex((s) => s.path == (activeField as Field).path);
    const current = cloneDeep(copy[idx].valueColors!);
    current[changeIdx][key] = value;
    newSetting[idx].valueColors = current;
    setColorScheme(false, { colorPool, fields: newSetting });
  };

  useEffect(() => {
    if (!values) {
      const copy = cloneDeep(fields);
      const idx = fields.findIndex(
        (s) => s.path == (activeField as Field).path
      );
      if (idx > -1) {
        copy[idx].valueColors = [defaultValue];
        setColorScheme(false, { colorPool, fields: copy });
      }
    }
  }, [values]);

  if (!values) return null;

  return (
    <div style={style}>
      {values.map((v, index) => (
        <RowContainer key={index}>
          <Input
            placeholder="Value (e.g. 'car')"
            value={v.value ?? ""}
            setter={(v) => handleChange(index, "value", v)}
            style={{ width: "8rem" }}
          />
          :
          <ColorSquare
            key={index}
            color={v.color}
            onClick={() => {
              setShowPicker((prev) =>
                prev.map((_, i) => (i === index ? !prev[index] : _))
              );
            }}
          >
            {showPicker[index] && (
              <ChromePickerWrapper>
                <ChromePicker
                  color={v.color}
                  onChangeComplete={(color) => hanldeColorChange(color, index)}
                  popperProps={{ positionFixed: true }}
                  ref={pickerRef}
                  disableAlpha={true}
                  onBlur={() =>
                    setShowPicker((prev) =>
                      prev.map((_, i) => (i === index ? false : _))
                    )
                  }
                  className={colorPicker}
                />
              </ChromePickerWrapper>
            )}
          </ColorSquare>
          <Input
            value={v.color ?? ""}
            setter={(v) => handleChange(index, "color", v)}
            style={{ width: "5rem" }}
          />
          <DeleteButton
            onClick={() => {
              handleDelete(index);
            }}
          />
        </RowContainer>
      ))}
      {Boolean(
        setting?.colorByAttribute ||
          (setting?.valueColors && setting.valueColors.length > 0)
      ) && (
        <AddContainer>
          <Button
            onClick={handleAdd}
            text="Add a new pair"
            title="add a new pair"
          />
        </AddContainer>
      )}
    </div>
  );
};

export default AttributeColorSetting;
