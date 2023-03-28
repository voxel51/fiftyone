import React, { useRef, useState } from "react";
import styled from "styled-components";
import AddIcon from "@material-ui/icons/Add";
import DeleteIcon from "@material-ui/icons/Delete";
import { ChromePicker } from "react-color";
import Input from "../../Common/Input";
import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";

const RowContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  column-count: 2;
`;

const AddContainer = styled.div`
  display: flex;
  justify-content: end;
  alight-items: center;
  margin: 0.25rem;
`;

const Control = styled.div`
  display: flex;
  flex-direction: row;
  cursor: pointer;
`;

const Text = styled.div`
  margin: auto 5px;
`;

const DeleteButton = styled(DeleteIcon)`
  cursor: pointer;
`;

const AddButton = styled(AddIcon)`
  margin: auto 0;
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
  const coloring = useRecoilValue(fos.coloring(false));
  const defaultValue = {
    name: "",
    color: coloring.pool[Math.floor(Math.random() * coloring.pool.length)],
  };
  const [values, setValues] = useState([
    {
      name: "",
      color: coloring.pool[Math.floor(Math.random() * coloring.pool.length)],
    },
  ]);
  const [showPicker, setShowPicker] = useState(
    Array(values.length).fill(false)
  );

  const handleAdd = () => {
    setValues([...values, defaultValue]);
    setShowPicker([...showPicker, false]);
  };

  const handleDelete = (index: number) => {
    const newValues = [...values];
    newValues.splice(index, 1);
    setValues(newValues);
  };

  const handleChange = (
    index: number,
    key: keyof typeof values[number],
    value: string
  ) => {
    const newValues = [...values];
    newValues[index][key] = value;
    setValues(newValues);
  };

  const hanldeColorChange = (color: any, index: number) => {
    const newColor = color?.hex;
    setShowPicker((prev) => prev.map((_, i) => (i === index ? false : _)));
    setValues((v) => {
      v[index].color = newColor;
      return v;
    });
  };

  return (
    <div style={style}>
      <AddContainer>
        <Control onClick={handleAdd}>
          <AddButton />
          <Text>Add new color pair</Text>
        </Control>
      </AddContainer>
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
    </div>
  );
};

export default AttributeColorSetting;
