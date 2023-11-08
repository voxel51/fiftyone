import { ValueColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import ValueColorList from "../controls/ValueColorList";
import { activeColorPath } from "../state";
import { getRandomColorFromPool } from "../utils";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";

const LabelTagByValue: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const activePath = useRecoilValue(activeColorPath);
  const setColorScheme = fos.useSetSessionColorScheme();

  const initialValue = colorScheme.labelTags?.valueColors;
  const setting = useMemo(
    () => colorScheme.labelTags,
    [activePath, colorScheme.labelTags]
  );
  const values = useMemo(() => setting?.valueColors ?? [], [setting]);
  const defaultValue = {
    value: "",
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const shouldShowAddButton = Boolean(
    setting?.valueColors && setting.valueColors.length > 0
  );

  const onSyncUpdate = useCallback((copy: ValueColorInput[]) => {
    if (copy) {
      setColorScheme((cur) => ({
        ...cur,
        labelTags: { ...cur.labelTags, valueColors: copy },
      }));
    }
  }, []);

  useEffect(() => {
    if (!values) {
      if (!colorScheme.labelTags?.valueColors) {
        const copy = { ...(colorScheme.labelTags ?? {}) };
        copy.valueColors = [defaultValue];
        setColorScheme({ ...colorScheme, labelTags: copy });
      }
    }
  }, [values]);

  return (
    <ValueColorList
      initialValue={initialValue as ValueColorInput[]}
      values={values as ValueColorInput[]}
      style={FieldCHILD_STYLE}
      onSyncUpdate={onSyncUpdate}
      shouldShowAddButton={shouldShowAddButton}
    />
  );
};

export default LabelTagByValue;
