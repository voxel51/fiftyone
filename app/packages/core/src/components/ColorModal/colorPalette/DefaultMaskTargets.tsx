import { MaskColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";
import IdxColorList from "../controls/IdxColorList";
import { getRandomColorFromPool } from "../utils";

const DefaultMaskTargets: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  //   const activePath = useRecoilValue(activeColorPath);
  const setColorScheme = fos.useSetSessionColorScheme();

  const initialValue = colorScheme.defaultMaskTargetsColors ?? [];
  const values = useMemo(
    () => colorScheme.defaultMaskTargetsColors,
    [colorScheme]
  );
  const defaultValue = {
    idx: 0,
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const shouldShowAddButton = Boolean(values?.length && values?.length > 0);

  const onSyncUpdate = useCallback((copy: MaskColorInput[]) => {
    if (copy) {
      setColorScheme((cur) => ({ ...cur, defaultMaskTargetsColors: copy }));
    }
  }, []);

  useEffect(() => {
    if (!values || values.length == 0) {
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

  return (
    <div>
      <Checkbox />
      <IdxColorList
        initialValue={initialValue as MaskColorInput[]}
        values={values as MaskColorInput[]}
        resetValue={values as MaskColorInput[]}
        style={FieldCHILD_STYLE}
        onSyncUpdate={onSyncUpdate}
        shouldShowAddButton={shouldShowAddButton}
        min={0}
        max={255}
        step={1}
      />
    </div>
  );
};

export default DefaultMaskTargets;
