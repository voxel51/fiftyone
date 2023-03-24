import React, { useRef, useState } from "react";
import styled from "styled-components";
import AddIcon from "@material-ui/icons/Add";
import DeleteIcon from "@material-ui/icons/Delete";
import { ChromePicker } from "react-color";

const RowContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
`;

const Input = styled.input`
  height: 30px;
  width: 200px;
  margin-right: 10px;
  padding: 0 10px;
  border-radius: 5px;
  border: 1px solid ${({ theme }) => theme.gray};
`;

const ColorPicker = styled.div<{ color: string }>`
  height: 30px;
  width: 30px;
  margin-right: 10px;
  cursor: pointer;
  background-color: ${({ color }) => color || "#fff"};
  border-radius: 5px;
`;

const DeleteButton = styled(DeleteIcon)`
  cursor: pointer;
`;

const AddButton = styled(AddIcon)`
  cursor: pointer;
  margin-right: 10px;
`;

const ColorSquare = styled.div<{ color: string }>`
  position: relative;
  width: 40px;
  height: 40px;
  margin: 5px;
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
  defaultValues?: {
    name: string;
    color: string;
  }[];
};

const AttributeColorSetting: React.FC<ColorPickerRowProps> = ({
  defaultValues = [{ name: "", color: "" }],
}) => {
  const [values, setValues] = useState(defaultValues);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const handleAdd = () => {
    setValues([...values, { name: "", color: "" }]);
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
    setValues((v) => {
      v[index].color = newColor;
      return v;
    });
    setShowPicker(false);
  };

  return (
    <>
      {values.map((value, index) => (
        <RowContainer key={index}>
          <Input
            type="text"
            placeholder="Value"
            value={value.name}
            onChange={(e) => handleChange(index, "name", e.target.value)}
          />
          <ColorSquare
            key={index}
            color={value.color}
            onClick={() => {
              setShowPicker(true);
            }}
          >
            {showPicker && (
              <ChromePickerWrapper>
                <ChromePicker
                  color={value.color}
                  onChangeComplete={(color) => hanldeColorChange(color, index)}
                  popperProps={{ positionFixed: true }}
                  ref={pickerRef}
                />
              </ChromePickerWrapper>
            )}
          </ColorSquare>
          {index !== 0 && (
            <DeleteButton
              onClick={() => {
                handleDelete(index);
              }}
            />
          )}
        </RowContainer>
      ))}
      <AddButton onClick={handleAdd} />
    </>
  );
};

export default AttributeColorSetting;
