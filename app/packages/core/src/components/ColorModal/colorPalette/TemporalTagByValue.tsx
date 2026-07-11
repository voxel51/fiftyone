import { ValueColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import ValueColorList from "../controls/ValueColorList";
import { activeColorPath } from "../state";
import { getRandomColorFromPool } from "../utils";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";

const TemporalTagByValue: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const activePath = useRecoilValue(activeColorPath);
  const setColorScheme = fos.useSetSessionColorScheme();

  const initialValue = colorScheme.temporalTags?.valueColors;
  const setting = useMemo(
    () => colorScheme.temporalTags,
    [activePath, colorScheme.temporalTags],
  );
  const values = useMemo(() => setting?.valueColors ?? [], [setting]);
  const defaultValue = {
    value: "",
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const shouldShowAddButton = Boolean(
    setting?.valueColors && setting.valueColors.length > 0,
  );

  const onSyncUpdate = useCallback((copy: ValueColorInput[]) => {
    if (copy) {
      setColorScheme((cur) => ({
        ...cur,
        temporalTags: { ...cur.temporalTags, valueColors: copy },
      }));
    }
  }, []);

  useEffect(() => {
    if (!values) {
      if (!colorScheme.temporalTags?.valueColors) {
        const copy = { ...(colorScheme.temporalTags ?? {}) };
        copy.valueColors = [defaultValue];
        setColorScheme({ ...colorScheme, temporalTags: copy });
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

export default TemporalTagByValue;
