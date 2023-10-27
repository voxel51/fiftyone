import { MaskTargetsInput, ValueColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";
import IdxColorList from "../controls/IdxColorList";
import { activeColorPath } from "../state";
import { getRandomColorFromPool } from "../utils";

const DefaultMaskTargets: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  //   const activePath = useRecoilValue(activeColorPath);
  const setColorScheme = fos.useSetSessionColorScheme();

  const initialValue = colorScheme.defaultMaskTargetsColors ?? [];
  const values = useMemo(() => colorScheme.defaultMaskTargetsColors, []);
  const defaultValue = {
    idx: null,
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const shouldShowAddButton = Boolean(values?.length > 0);

  const onSyncUpdate = useCallback((copy: MaskTargetsInput[]) => {
    if (copy) {
      setColorScheme((cur) => ({ ...cur, defaultMaskTargetsColors: copy }));
    }
  }, []);

  useEffect(() => {
    if (!values) {
      if (!colorScheme.defaultMaskTargetsColors) {
        setColorScheme({
          ...colorScheme,
          defaultMaskTargetsColors: [defaultValue],
        });
      }
    }
  }, [values]);

  return (
    <IdxColorList
      initialValue={initialValue as MaskTargetsInput[]}
      values={values as MaskTargetsInput[]}
      resetValue={values as MaskTargetsInput[]}
      style={FieldCHILD_STYLE}
      onSyncUpdate={onSyncUpdate}
      shouldShowAddButton={shouldShowAddButton}
    />
  );
};

export default DefaultMaskTargets;
