/* 
In color by value mode, fields and label tags use this component 
*/

import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import * as fos from "@fiftyone/state";
import colorString from "color-string";
import { cloneDeep } from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChromePicker } from "react-color";
import { useRecoilValue } from "recoil";
import Input, { NumberInput } from "../../Common/Input";
import { Button } from "../../utils";
import {
  AddContainer,
  ChromePickerWrapper,
  ColorSquare,
  DeleteButton,
  RowContainer,
} from "../ShareStyledDiv";
import { activeColorPath } from "../state";
import { getRandomColorFromPool } from "../utils";
import { colorPicker } from "./../colorPalette/Colorpicker.module.css";

type MaskColorInput = {
  intTarget: number;
  color: string;
};

type Input = {
  intTarget?: number;
  color: string;
};

type IdxColorProp = {
  initialValue: MaskColorInput[];
  values: MaskColorInput[];
  style: React.CSSProperties;
  onValidate?: (value: number) => boolean;
  onSyncUpdate: (input: MaskColorInput[]) => void;
  shouldShowAddButton: boolean;
  min?: number;
  max?: number;
  step?: number;
};

const IdxColorList: React.FC<IdxColorProp> = ({
  initialValue,
  values,
  style,
  onValidate,
  onSyncUpdate,
  shouldShowAddButton,
  min,
  max,
  step,
}) => {
  const [input, setInput] = useState<Input[]>(initialValue ?? []);
  const [showPicker, setShowPicker] = useState(
    Array(values?.length ?? 0).fill(false)
  );
  const pickerRef = useRef<ChromePicker>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const activePath = useRecoilValue(activeColorPath) ?? "global";
  const colorScheme = useRecoilValue(fos.colorScheme);

  const handleAdd = () => {
    const newValue = {
      intTarget: undefined,
      color: getRandomColorFromPool(colorScheme.colorPool),
    };
    const newInput = input.length > 0 ? [...input, newValue] : [newValue];
    setInput(newInput);
    setShowPicker([...showPicker, false]);
    /* does not sync update the session colorscheme here
    because intTarget is not valid
    it would sync to session when the user adds an valid intTarget input
     */
  };

  const handleDelete = (colorIdx: number) => {
    const valueColors = [
      ...input.slice(0, colorIdx),
      ...input.slice(colorIdx + 1),
    ];
    setInput(valueColors);
    onSyncUpdate(valueColors as MaskColorInput[]);
  };

  // color picker selection and sync with session
  const hanldeColorChange = useCallback(
    (color: any, colorIdx: number) => {
      setShowPicker((prev) => prev.map((_, i) => (i === colorIdx ? false : _)));
      const copy = input ? [...cloneDeep(input)] : [];
      copy[colorIdx].color = color?.hex;
      setInput(copy);
      onSyncUpdate(copy as MaskColorInput[]);
    },
    [input, onSyncUpdate]
  );

  // onBlue and onEnter in numberfield to validate certain rules
  const onSyncIdx = useCallback(
    (intValue: number, index: number) => {
      if ((onValidate && onValidate(intValue)) || !onValidate) {
        onSyncUpdate(input as MaskColorInput[]);
      } else {
        const warning = cloneDeep(values) as Input[];
        if (!warning) return;
        warning[index].intTarget = undefined;
        setInput(warning);
        setTimeout(() => {
          setInput(() => {
            const prev = cloneDeep(values);
            prev[index].intTarget = values[index].intTarget;
            return prev;
          });
        }, 1000);
      }
    },
    [input, values, onSyncUpdate, onValidate]
  );

  // onBlur and onEnter in textfield to validate color and sync with atoms
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
        setInput(copy);
        onSyncUpdate(copy as MaskColorInput[]);
      }
    },
    [input, values, onSyncUpdate]
  );

  // on changing tabs, sync local state with new session values
  useEffect(() => {
    setInput(values ?? []);
  }, [activePath]);

  useEffect(() => {
    setInput(initialValue);
  }, [values]);

  fos.useOutsideClick(wrapperRef, () => {
    setShowPicker(Array(values?.length ?? 0).fill(false));
  });

  if (!values) return null;

  return (
    <div style={style}>
      {input?.map((v, index) => (
        <RowContainer key={index}>
          <NumberInput
            placeholder="integer (1 to 255)"
            value={input[index].intTarget}
            setter={(v) =>
              setInput((p) => {
                const copy = cloneDeep(p);
                copy[index].intTarget = v;
                return copy;
              })
            }
            onBlur={() => {
              if (input[index].intTarget !== undefined) {
                onSyncIdx(input[index].intTarget!, index);
              }
            }}
            style={{ width: "12rem" }}
            min={min}
            max={max}
            step={step}
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
            onBlur={() => {
              onSyncColor(index, input[index].color);
            }}
            onEnter={() => {
              onSyncColor(index, input[index].color);
            }}
          />
          <DeleteButton
            onClick={() => {
              handleDelete(index);
            }}
          />
        </RowContainer>
      ))}
      {shouldShowAddButton && (
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

export default IdxColorList;
