import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import * as fos from "@fiftyone/state";
import DeleteIcon from "@material-ui/icons/Delete";
import colorString from "color-string";
import { cloneDeep } from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChromePicker } from "react-color";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Input from "../../Common/Input";
import { Button } from "../../utils";
import { activeColorField } from "../state";
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
  useLabelColors?: boolean;
};

type Input = {
  value: string;
  color: string;
};

// this is the component that renders adding the {value: "car",
//  color: "#dd00dd"} pair component in color by value mode
const AttributeColorSetting: React.FC<ColorPickerRowProps> = ({
  style,
  useLabelColors,
}) => {
  const pickerRef = useRef<ChromePicker>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activeField = useRecoilValue(activeColorField);
  const colorScheme = useRecoilValue(fos.colorScheme);
  // const { colorPool = [], fields } = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const setting = useMemo(
    () => colorScheme.fields.find((s) => s.path == activeField.path),
    [activeField, colorScheme.fields]
  );

  const index = useMemo(
    () => colorScheme.fields.findIndex((s) => s.path == activeField.path),
    [activeField, colorScheme.fields]
  );

  const defaultValue = {
    value: "",
    color:
      colorScheme.colorPool[
        Math.floor(Math.random() * colorScheme.colorPool.length)
      ],
  };

  const values = setting?.valueColors;

  const [input, setInput] = useState<Input[]>([]);
  const [showPicker, setShowPicker] = useState(
    Array(values?.length ?? 0).fill(false)
  );

  const handleAdd = useCallback(() => {
    const newValue = {
      value: "",
      color:
        colorScheme.colorPool[
          Math.floor(Math.random() * colorScheme.colorPool.length)
        ],
    };
    const newInput = input.length > 0 ? [...input, newValue] : [newValue];
    const newSetting = cloneDeep(colorScheme.fields);
    newSetting[index].valueColors = newInput;
    setInput(newInput);
    setColorScheme({ ...colorScheme, fields: newSetting });
    setShowPicker([...showPicker, false]);
  }, [
    colorScheme.colorPool,
    input,
    index,
    colorScheme.fields,
    setColorScheme,
    showPicker,
  ]);

  const handleDelete = useCallback(
    (colorIdx: number) => {
      const valueColors = [
        ...input.slice(0, colorIdx),
        ...input.slice(colorIdx + 1),
      ];
      setInput(valueColors);
      const newSetting = cloneDeep(colorScheme.fields);
      newSetting[index].valueColors = valueColors;
      setColorScheme({ ...colorScheme, fields: newSetting });
    },
    [index, colorScheme.fields, setColorScheme, input]
  );

  const onSyncUpdate = useCallback(
    (copy: Input[]) => {
      const newSetting = cloneDeep(colorScheme.fields);
      newSetting[index].valueColors = copy;
      setInput(copy);
      setColorScheme({ ...colorScheme, fields: newSetting });
    },
    [colorScheme.fields, index, setColorScheme]
  );

  // color picker selection and sync with session
  const hanldeColorChange = useCallback(
    (color: any, colorIdx: number) => {
      setShowPicker((prev) => prev.map((_, i) => (i === colorIdx ? false : _)));
      const copy = input ? [...cloneDeep(input)] : [];
      copy[colorIdx].color = color?.hex;
      onSyncUpdate(copy);
    },
    [input, onSyncUpdate]
  );

  // onBlur and onEnter in textfield to validate color and sync with session
  const onSyncColor = useCallback(
    (changeIdx: number, color: string) => {
      if (!isValidColor(color)) {
        // revert the input state value as color is not CSS invalid
        const warning = cloneDeep(values);
        if (!values || !warning) return;
        warning[changeIdx].color = "invalid";
        setInput(warning);
        setTimeout(() => {
          setInput(() => {
            const prev = cloneDeep(values);
            prev[changeIdx].color = values[changeIdx].color;
            return prev;
          });
        }, 1000);
      } else {
        // convert to hex code
        const hexColor = colorString.to.hex(
          colorString.get(color)?.value ?? []
        );
        const copy = cloneDeep(input);
        copy[changeIdx].color = hexColor;
        onSyncUpdate(copy);
      }
    },
    [input, values, onSyncUpdate]
  );

  useEffect(() => {
    if (!values) {
      const copy = cloneDeep(colorScheme.fields);
      const idx = colorScheme.fields.findIndex(
        (s) => s.path == activeField.path
      );
      if (idx > -1) {
        copy[idx].valueColors = [defaultValue];
        setColorScheme({ ...colorScheme, fields: copy });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  // on reset, sync local state with new session values
  useEffect(() => {
    setInput(values ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeField.path]);

  useEffect(() => {
    setInput(!useLabelColors ? [] : values);
  }, [useLabelColors, values]);

  fos.useOutsideClick(wrapperRef, () => {
    setShowPicker(Array(values?.length ?? 0).fill(false));
  });

  if (!values) return null;

  return (
    <div style={style}>
      {input?.map((v, index) => (
        <RowContainer key={index}>
          <Input
            placeholder="Value (e.g. 'car')"
            value={input[index].value ?? ""}
            setter={(v) =>
              setInput((p) => {
                const copy = cloneDeep(p);
                copy[index].value = v;
                return copy;
              })
            }
            onBlur={() => onSyncUpdate(input)}
            style={{ width: "12rem" }}
          />
          :
          <ColorSquare
            key={index}
            color={input[index].color}
            onClick={() => {
              setShowPicker((prev) =>
                prev.map((_, i) => (i === index ? !prev[index] : _))
              );
            }}
          >
            {showPicker[index] && (
              <ChromePickerWrapper ref={wrapperRef}>
                <ChromePicker
                  color={input[index].color}
                  onChange={(color) =>
                    setInput((prev) => {
                      const copy = cloneDeep(prev);
                      copy[index].color = color.hex;
                      return copy;
                    })
                  }
                  onChangeComplete={(color) => hanldeColorChange(color, index)}
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
            placeholder="#009900"
            value={input[index].color ?? ""}
            setter={(v) =>
              setInput((prev) => {
                const copy = cloneDeep(prev);
                copy[index].color = v;
                return copy;
              })
            }
            style={{ width: "150px" }}
            onBlur={() => onSyncColor(index, input[index].color)}
            onEnter={() => onSyncColor(index, input[index].color)}
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
