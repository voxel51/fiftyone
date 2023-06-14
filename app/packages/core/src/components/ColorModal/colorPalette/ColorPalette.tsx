import * as fos from "@fiftyone/state";
import AddIcon from "@material-ui/icons/Add";
import DeleteIcon from "@material-ui/icons/Delete";
import React, { useEffect, useRef, useState } from "react";
import { ChromePicker } from "react-color";
import styled from "styled-components";

import Checkbox from "../../Common/Checkbox";
import { colorPicker } from "./Colorpicker.module.css";

import { useRecoilValue } from "recoil";
import {
  colorBlindFriendlyPalette,
  fiftyoneDefaultColorPalette,
  isSameArray,
} from "../utils";

interface ColorPaletteProps {
  maxColors?: number;
  style?: React.CSSProperties;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({
  maxColors = 20,
  style,
}) => {
  const { colorPool, fields, labelTags } = useRecoilValue(
    fos.sessionColorScheme
  );
  const setColorScheme = fos.useSetSessionColorScheme();
  const [pickerColor, setPickerColor] = useState<string | null>(null);

  const isUsingColorBlindOption = isSameArray(
    colorPool,
    colorBlindFriendlyPalette
  );

  const isUsingFiftyoneClassic = isSameArray(
    colorPool,
    fiftyoneDefaultColorPalette
  );

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const pickerRef = useRef<ChromePicker>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleColorChange = (color: any) => {
    if (activeIndex !== null && color) {
      const newColors = colorPool ? [...colorPool] : [];
      newColors[activeIndex] = color.hex;
      setColorScheme(false, {
        colorPool: newColors,
        fields,
        labelTags,
      });
    }
  };

  const handleColorDelete = (index: number) => {
    const newColors = colorPool ? [...colorPool] : [];
    newColors.splice(index, 1);
    setColorScheme(false, {
      colorPool: newColors,
      fields,
      labelTags,
    });
  };

  const handleColorAdd = () => {
    if (colorPool?.length < maxColors) {
      setColorScheme(false, {
        colorPool: [...colorPool, "#ffffff"],
        fields,
        labelTags,
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

  if (!colorPool) return null;

  return (
    <div style={style} id="color-palette">
      <ColorPaletteContainer>
        {colorPool.map((color, index) => (
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
        {colorPool.length < maxColors && (
          <AddSquare onClick={handleColorAdd}>
            <AddIcon>+</AddIcon>
          </AddSquare>
        )}
      </ColorPaletteContainer>
      <div style={{ width: "50%" }}>
        {!isUsingFiftyoneClassic && (
          <Checkbox
            name={"Use fiftyone classic option"}
            value={isUsingFiftyoneClassic}
            setValue={(v) =>
              v &&
              setColorScheme(false, {
                colorPool: fiftyoneDefaultColorPalette,
                fields,
                labelTags,
              })
            }
          />
        )}
        {!isUsingColorBlindOption && (
          <Checkbox
            name={"Use color blind friendly option"}
            value={isUsingColorBlindOption}
            setValue={(v) =>
              v &&
              setColorScheme(false, {
                colorPool: colorBlindFriendlyPalette,
                fields,
                labelTags,
              })
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
