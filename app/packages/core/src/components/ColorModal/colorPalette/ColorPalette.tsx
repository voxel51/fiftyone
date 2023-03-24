import React, { Fragment, useEffect, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import DeleteIcon from "@material-ui/icons/Delete";
import AddIcon from "@material-ui/icons/Add";
import * as fos from "@fiftyone/state";

import { ChromePicker } from "react-color";

interface ColorPaletteProps {
  maxColors?: number;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({ maxColors = 20 }) => {
  const currentColorPool = useRecoilValue(fos.colorPool);
  const [colors, setColors] = useState<string[]>(
    currentColorPool.slice(0, maxColors) as string[]
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const handleColorChange = (color: any) => {
    if (activeIndex !== null && color) {
      const newColors = [...colors];
      newColors[activeIndex] = color.hex;
      setColors(newColors);
      setActiveIndex(null);
      setShowPicker(false);
    }
  };

  const handleColorDelete = (index: number) => {
    const newColors = [...colors];
    newColors.splice(index, 1);
    setColors(newColors);
  };

  const handleColorAdd = () => {
    if (colors.length < maxColors) {
      setColors([...colors, ""]);
    }
  };

  return (
    <ColorPaletteContainer>
      {colors.map((color, index) => (
        <ColorSquare
          key={index}
          color={color}
          onClick={() => {
            setActiveIndex(index);
            setShowPicker(true);
            setDeleteIndex(null);
          }}
          onMouseEnter={() => setDeleteIndex(index)}
          onMouseLeave={() => setDeleteIndex(null)}
        >
          {color && deleteIndex === index && (
            <div
              style={{
                color: "#fff",
                position: "absolute",
                right: "-2px",
                top: "-2px",
              }}
            >
              <DeleteIcon
                onClick={() => handleColorDelete(index)}
                fontSize={"small"}
              />
            </div>
          )}
          {showPicker && activeIndex === index && (
            <ChromePickerWrapper>
              <ChromePicker
                color={color}
                onChangeComplete={handleColorChange}
                popperProps={{ positionFixed: true }}
                ref={pickerRef}
              />
            </ChromePickerWrapper>
          )}
        </ColorSquare>
      ))}
      {colors.length < maxColors && (
        <AddSquare onClick={handleColorAdd}>
          <AddIcon>+</AddIcon>
        </AddSquare>
      )}
    </ColorPaletteContainer>
  );
};

const ColorPaletteContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
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

const AddSquare = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40px;
  height: 40px;
  margin: 5px;
  cursor: pointer;
  background-color: #eee;
  border-radius: 3px;

  &:hover {
    background-color: #ddd;
  }
`;

export default ColorPalette;
