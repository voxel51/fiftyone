import * as fos from "@fiftyone/state";
import { cloneDeep } from "lodash";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { FieldCHILD_STYLE, SectionWrapper } from "../ShareStyledDiv";
import IdxColorList from "../controls/IdxColorList";
import { activeColorPath } from "../state";
import { getRandomColorFromPool } from "../utils";

type MaskTargetInput = {
  idx: number;
  color: string;
};

const FieldsMaskTargets: React.FC = () => {
  const is2DMask = true; // TODO: add condition check;
  const colorScheme = useRecoilValue(fos.colorScheme);
  const activePath = useRecoilValue(activeColorPath);
  const setColorScheme = fos.useSetSessionColorScheme();

  const setting = useMemo(
    () => colorScheme.fields?.find((s) => s.path == activePath),
    [activePath, colorScheme.fields]
  );
  const values = useMemo(() => setting?.maskTargetsColors ?? [], [setting]);
  const defaultValue = {
    idx: null,
    color: getRandomColorFromPool(colorScheme.colorPool),
  };
  const index = useMemo(
    () => colorScheme.fields?.findIndex((s) => s.path == activePath),
    [activePath]
  );
  const shouldShowAddButton = Boolean(
    setting?.maskTargetsColors && setting.maskTargetsColors.length > 0
  );

  const onSyncUpdate = useCallback(
    (copy: MaskTargetInput[]) => {
      if (copy) {
        const newSetting = cloneDeep(colorScheme.fields ?? []);
        const idx = colorScheme.fields?.findIndex((s) => s.path == activePath);
        if (idx > -1) {
          newSetting[idx].maskTargetsColors = copy;
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
        copy[idx].maskTargetsColors = [defaultValue];
        setColorScheme({ ...colorScheme, fields: copy });
      }
    }
  }, [values]);

  return (
    <SectionWrapper>
      {is2DMask && (
        <>
          <div style={FieldCHILD_STYLE}>Set colors for mask targets:</div>
          <IdxColorList
            initialValue={values as MaskTargetInput[]}
            values={values as MaskTargetInput[]}
            resetValue={values as MaskTargetInput[]}
            style={FieldCHILD_STYLE}
            onSyncUpdate={onSyncUpdate}
            shouldShowAddButton={shouldShowAddButton}
          />
        </>
      )}
    </SectionWrapper>
  );
};

export default FieldsMaskTargets;
