import React, { useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import DeleteIcon from "@material-ui/icons/Delete";
import AddIcon from "@material-ui/icons/Add";
import { ChromePicker } from "react-color";
import * as fos from "@fiftyone/state";

import {
  colorBlindFriendlyPalette,
  isSameArray,
  tempGlobalSetting,
} from "../utils";
import Checkbox from "../../Common/Checkbox";

interface ColorPaletteProps {
  maxColors?: number;
  style?: React.CSSProperties;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({
  maxColors = 20,
  style,
}) => {
  const [tempColor, setTempColor] = useRecoilState(tempGlobalSetting);
  const colors = tempColor.colors;

  const currentColorPalette = useRecoilValue(fos.coloring(false))
    .pool as string[];
  const hasChange = !isSameArray(colors, currentColorPalette);
  const isUsingColorBlindOption = isSameArray(
    colors,
    colorBlindFriendlyPalette
  );

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  if (!colors) return null;
  const handleColorChange = (color: any) => {
    if (activeIndex !== null && color) {
      const newColors = colors ? [...colors] : [];
      newColors[activeIndex] = color.hex;
      setTempColor((prev) => ({ ...prev, colors: newColors }));
      setActiveIndex(null);
      setShowPicker(false);
    }
  };

  const handleColorDelete = (index: number) => {
    const newColors = colors ? [...colors] : [];
    newColors.splice(index, 1);
    setTempColor((prev) => ({ ...prev, colors: newColors }));
  };

  const handleColorAdd = () => {
    if (colors?.length < maxColors) {
      setTempColor((prev) => ({ ...prev, colors: [...colors, ""] }));
    }
  };

  return (
    <div style={style}>
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
                  id={`delete-${index}`}
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
                  disableAlpha={true}
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
      {!isUsingColorBlindOption && (
        <Checkbox
          name={"Use color blind friendly option"}
          value={isUsingColorBlindOption}
          setValue={(v) =>
            v &&
            setTempColor((s) => ({ ...s, colors: colorBlindFriendlyPalette }))
          }
        />
      )}
      {hasChange && (
        <Checkbox
          name={"revert to current setting"}
          value={!hasChange}
          setValue={(v) =>
            v && setTempColor((s) => ({ ...s, colors: currentColorPalette }))
          }
        />
      )}
    </div>
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
