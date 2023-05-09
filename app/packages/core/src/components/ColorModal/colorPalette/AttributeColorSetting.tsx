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
  const { colorPool, customizedColorSettings } = useRecoilValue(
    fos.sessionColorScheme
  );
  const { setColorScheme } = fos.useSessionColorScheme();
  const setting = customizedColorSettings.find(
    (s) => s.field == (activeField as Field).path
  );

  const newSetting = cloneDeep(customizedColorSettings);
  const index = customizedColorSettings.findIndex(
    (s) => s.field == (activeField as Field).path
  );

  const defaultValue = {
    name: "",
    color: colorPool[Math.floor(Math.random() * colorPool.length)],
  };

  const values = setting?.labelColors;

  const [showPicker, setShowPicker] = useState(
    Array(values?.length ?? 0).fill(false)
  );

  const handleAdd = () => {
    newSetting[index].labelColors = setting?.labelColors
      ? [...setting.labelColors, defaultValue]
      : [defaultValue];
    setColorScheme(colorPool, newSetting, false);
    setShowPicker([...showPicker, false]);
  };

  const handleDelete = (colorIdx: number) => {
    const labelValues = values ? [...cloneDeep(values)] : [];
    newSetting[index].labelColors = [
      ...labelValues.slice(0, colorIdx),
      ...labelValues.slice(colorIdx + 1),
    ];
    setColorScheme(colorPool, newSetting, false);
  };

  const hanldeColorChange = (color: any, colorIdx: number) => {
    setShowPicker((prev) => prev.map((_, i) => (i === colorIdx ? false : _)));
    const labelValues = values ? [...cloneDeep(values)] : [];
    labelValues[colorIdx].color = color?.hex;
    newSetting[index].labelColors = labelValues;
    setColorScheme(colorPool, newSetting, false);
  };

  const handleChange = (
    changeIdx: number,
    key: "name" | "color",
    value: string
  ) => {
    const copy = cloneDeep(customizedColorSettings);
    const idx = customizedColorSettings.findIndex(
      (s) => s.field == (activeField as Field).path
    );
    const current = cloneDeep(copy[idx].labelColors!);
    current[changeIdx][key] = value;
    newSetting[idx].labelColors = current;
    setColorScheme(colorPool, newSetting, false);
  };

  useEffect(() => {
    if (!values) {
      const copy = cloneDeep(customizedColorSettings);
      const idx = customizedColorSettings.findIndex(
        (s) => s.field == (activeField as Field).path
      );
      if (idx > -1) {
        copy[idx].labelColors = [defaultValue];
        setColorScheme(colorPool, copy, false);
      }
    }
  }, [values]);

  if (!values) return null;
  return (
    <div style={style}>
      {values.map((value, index) => (
        <RowContainer key={index}>
          <Input
            placeholder="Value (e.g. 'car')"
            value={value.name ?? ""}
            setter={(v) => handleChange(index, "name", v)}
            style={{ width: "8rem" }}
          />
          :
          <ColorSquare
            key={index}
            color={value.color}
            onClick={() => {
              setShowPicker((prev) =>
                prev.map((_, i) => (i === index ? !prev[index] : _))
              );
            }}
          >
            {showPicker[index] && (
              <ChromePickerWrapper>
                <ChromePicker
                  color={value.color}
                  onChangeComplete={(color) => hanldeColorChange(color, index)}
                  popperProps={{ positionFixed: true }}
                  ref={pickerRef}
                  disableAlpha={true}
                  onBlur={() =>
                    setShowPicker((prev) =>
                      prev.map((_, i) => (i === index ? false : _))
                    )
                  }
                />
              </ChromePickerWrapper>
            )}
          </ColorSquare>
          <Input
            value={value.color ?? ""}
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
      <AddContainer>
        <Button
          onClick={handleAdd}
          text="Add a new pair"
          title="add a new pair"
        />
      </AddContainer>
    </div>
  );
};

export default AttributeColorSetting;
