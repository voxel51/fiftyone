import { ValueColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { cloneDeep } from "lodash";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { FieldCHILD_STYLE } from "../ShareStyledDiv";
import ValueColorList from "../controls/ValueColorList";
import { activeColorPath } from "../state";
import { getRandomColorFromPool } from "../utils";

const FieldByValue: React.FC = () => {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const activePath = useRecoilValue(activeColorPath);
  const setColorScheme = fos.useSetSessionColorScheme();

  const setting = useMemo(
    () => colorScheme.fields?.find((s) => s.path == activePath),
    [activePath, colorScheme.fields]
  );
  const values = useMemo(() => setting?.valueColors ?? [], [setting]);
  const defaultValue = {
    value: "",
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const index = useMemo(
    () => colorScheme.fields?.findIndex((s) => s.path == activePath),
    [activePath]
  );
  const shouldShowAddButton = Boolean(
    setting?.valueColors && setting.valueColors.length > 0
  );

  const onSyncUpdate = useCallback(
    (copy: ValueColorInput[]) => {
      if (copy) {
        const newSetting = cloneDeep(colorScheme.fields ?? []);
        const idx = colorScheme.fields?.findIndex((s) => s.path == activePath);
        if (idx > -1) {
          newSetting[idx].valueColors = copy;
          setColorScheme({ ...colorScheme, fields: newSetting });
        }
      }
    },
    [index]
  );

  useEffect(() => {
    if (!values) {
      const copy = cloneDeep(colorScheme.fields);
      const idx = colorScheme.fields?.findIndex((s) => s.path == activePath);
      if (idx > -1) {
        copy[idx].valueColors = [defaultValue];
        setColorScheme({ ...colorScheme, fields: copy });
      }
    }
  }, [values]);

  return (
    <ValueColorList
      initialValue={values as ValueColorInput[]}
      values={values as ValueColorInput[]}
      style={FieldCHILD_STYLE}
      onSyncUpdate={onSyncUpdate}
      shouldShowAddButton={shouldShowAddButton}
    />
  );
};

export default FieldByValue;
