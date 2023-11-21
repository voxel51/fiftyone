/*this is the UI component of default segmentation in the global setting page of color panel */

import { MaskColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import Checkbox from "../../Common/Checkbox";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";
import IdxColorList from "../controls/IdxColorList";
import {
  getRandomColorFromPool,
  isValidMaskInput,
  validateIntMask,
} from "../utils";

const DefaultMaskTargets: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const initialValue = colorScheme.defaultMaskTargetsColors ?? [];
  const values = colorScheme.defaultMaskTargetsColors;
  const state = useMemo(
    () => ({
      useMaskTargetsColors: Boolean(values?.length),
    }),
    [values]
  );

  const defaultValue = {
    intTarget: 1,
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const shouldShowAddButton = Boolean(values?.length);

  const onSyncUpdate = useCallback(
    (copy: MaskColorInput[]) => {
      if (copy && isValidMaskInput(copy)) {
        setColorScheme((cur) => ({ ...cur, defaultMaskTargetsColors: copy }));
      }
    },
    [setColorScheme]
  );

  useEffect(() => {
    if (
      !colorScheme.defaultMaskTargetsColors?.length &&
      state.useMaskTargetsColors
    ) {
      setColorScheme({
        ...colorScheme,
        defaultMaskTargetsColors: [defaultValue],
      });
    }
  }, [
    colorScheme.defaultMaskTargetsColors,
    state.useMaskTargetsColors,
    defaultValue,
  ]);

  return (
    <div>
      <Checkbox
        name={`Use custom color for default mask targets`}
        value={state.useMaskTargetsColors}
        setValue={(v: boolean) => {
          if (!v) {
            setColorScheme((s) => ({ ...s, defaultMaskTargetsColors: [] }));
          } else {
            setColorScheme((s) => ({
              ...s,
              defaultMaskTargetsColors: [defaultValue],
            }));
          }
        }}
      />
      {state?.useMaskTargetsColors && (
        <IdxColorList
          initialValue={initialValue as MaskColorInput[]}
          values={values as MaskColorInput[]}
          style={FieldCHILD_STYLE}
          onValidate={validateIntMask}
          onSyncUpdate={onSyncUpdate}
          shouldShowAddButton={shouldShowAddButton}
          min={1}
          max={255}
          step={1}
        />
      )}
    </div>
  );
};

export default DefaultMaskTargets;
