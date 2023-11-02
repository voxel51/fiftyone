import { MaskColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import Checkbox from "../../Common/Checkbox";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";
import IdxColorList from "../controls/IdxColorList";
import { getRandomColorFromPool, validateIntMask } from "../utils";

const DefaultMaskTargets: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();

  const initialValue = colorScheme.defaultMaskTargetsColors ?? [];
  const values = useMemo(
    () => colorScheme.defaultMaskTargetsColors,
    [colorScheme]
  );
  const defaultValue = {
    idx: null,
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const shouldShowAddButton = Boolean(values?.length && values?.length > 0);

  const onSyncUpdate = useCallback(
    (copy: MaskColorInput[]) => {
      if (copy) {
        setColorScheme((cur) => ({ ...cur, defaultMaskTargetsColors: copy }));
      }
    },
    [setColorScheme, colorScheme]
  );

  useEffect(() => {
    if (!values) {
      if (
        !colorScheme.defaultMaskTargetsColors ||
        colorScheme.defaultMaskTargetsColors.length == 0
      ) {
        setColorScheme({
          ...colorScheme,
          defaultMaskTargetsColors: [defaultValue],
        });
      }
    }
  }, [values]);

  const state = useMemo(
    () => ({
      useMaskTargetsColors: Boolean(
        colorScheme.defaultMaskTargetsColors &&
          colorScheme.defaultMaskTargetsColors.length > 0
      ),
    }),
    [colorScheme.defaultMaskTargetsColors]
  );

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
