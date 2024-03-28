import * as fos from "@fiftyone/state";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import React, { useEffect, useRef, useState } from "react";
import { ChromePicker } from "react-color";
import { selector, useRecoilValue } from "recoil";
import styled from "styled-components";
import Checkbox from "../../Common/Checkbox";
import { colorBlindFriendlyPalette, isSameArray } from "../utils";
import { colorPicker } from "./Colorpicker.module.css";

interface ColorPaletteProps {
  maxColors?: number;
  style?: React.CSSProperties;
}

const isDefaultColorPool = selector({
  key: "isDefaultColorPool",
  get: ({ get }) =>
    isSameArray(get(fos.colorScheme).colorPool, get(fos.config).colorPool),
});

const isColorBlindColorPool = selector({
  key: "isColorBlindColorPool",
  get: ({ get }) =>
    isSameArray(get(fos.colorScheme).colorPool, colorBlindFriendlyPalette),
});

const ColorPalette: React.FC<ColorPaletteProps> = ({
  maxColors = 20,
  style,
}) => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const colors = colorScheme.colorPool;
  const [pickerColor, setPickerColor] = useState<string | null>(null);

  const isUsingDefault = useRecoilValue(isDefaultColorPool);
  const isUsingColorBlindOption = useRecoilValue(isColorBlindColorPool);
  const defaultPool = useRecoilValue(fos.config).colorPool;

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const pickerRef = useRef<ChromePicker>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleColorChange = (color: any) => {
    if (activeIndex !== null && color) {
      const newColors = colors ? [...colors] : [];
      newColors[activeIndex] = color.hex;
      setColorScheme((current) => ({
        ...current,
        colorPool: newColors,
      }));
    }
  };

  const handleColorDelete = (index: number) => {
    const newColors = colors ? [...colors] : [];
    newColors.splice(index, 1);
    setColorScheme((current) => ({
      ...current,
      colorPool: newColors,
    }));
  };

  const handleColorAdd = () => {
    if (colors.length < maxColors) {
      setColorScheme({
        ...colorScheme,
        colorPool: [...colors, "#ffffff"],
      });
    }
  };

  fos.useOutsideClick(wrapperRef, () => {
    setShowPicker(false);
    setActiveIndex(null);
  });

  useEffect(() => {
    if (!showPicker) setPickerColor(null);
  }, [showPicker]);

  if (!colors) return null;

  return (
    <div style={style} id="color-palette">
      <ColorPaletteContainer>
        {colors.map((color, index) => (
          <ColorSquare
            key={index}
            color={color}
            data-cy={`color-palette-${index}`}
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
                  color: "#ffffff",
                  position: "absolute",
                  right: "-2px",
                  top: "-2px",
                }}
              >
                <DeleteIcon
                  onClick={() => handleColorDelete(index)}
                  fontSize={"small"}
                  id={`delete-${index}`}
                  data-cy={`delete-color-square-${index}`}
                />
              </div>
            )}
            {showPicker && activeIndex === index && (
              <ChromePickerWrapper ref={wrapperRef}>
                <ChromePicker
                  color={pickerColor || color}
                  onChange={(color) => setPickerColor(color.hex)}
                  onChangeComplete={handleColorChange}
                  ref={pickerRef}
                  disableAlpha={true}
                  className={colorPicker}
                />
              </ChromePickerWrapper>
            )}
          </ColorSquare>
        ))}
        {colors.length < maxColors && (
          <AddSquare onClick={handleColorAdd} data-cy="custom-colors-add-color">
            <AddIcon>+</AddIcon>
          </AddSquare>
        )}
      </ColorPaletteContainer>
      <div style={{ width: "50%" }}>
        {!isUsingDefault && (
          <Checkbox
            name={"Use default"}
            value={isUsingDefault}
            setValue={(v) =>
              v &&
              setColorScheme((current) => ({
                ...current,
                colorPool: defaultPool,
              }))
            }
          />
        )}
        {!isUsingColorBlindOption && (
          <Checkbox
            name={"Use color blind friendly option"}
            value={isUsingColorBlindOption}
            setValue={(v) =>
              v &&
              setColorScheme((current) => ({
                ...current,
                colorPool: colorBlindFriendlyPalette,
              }))
            }
          />
        )}
      </div>
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
