import { isRgbMaskTargets } from "@fiftyone/looker/src/overlays/util";
import { MaskColorInput } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { cloneDeep } from "lodash";
import React, { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import Checkbox from "../../Common/Checkbox";
import { fieldColorSetting } from "../FieldSetting";
import { FieldCHILD_STYLE, SectionWrapper } from "../ShareStyledDiv";
import IdxColorList from "../controls/IdxColorList";
import { activeColorPath } from "../state";
import {
  getRandomColorFromPool,
  isValidMaskInput,
  validateIntMask,
} from "../utils";

const FieldsMaskTargets: React.FC = () => {
  const maskTargets = useRecoilValue(fos.targets).fields;
  const isRGBMask = isRgbMaskTargets(maskTargets);

  const colorScheme = useRecoilValue(fos.colorScheme);
  const activePath = useRecoilValue(activeColorPath);
  const setColorScheme = fos.useSetSessionColorScheme();
  const [setting, setSetting] = useRecoilState(fieldColorSetting(activePath));

  const values = useMemo(() => setting?.maskTargetsColors ?? [], [setting]);

  const defaultValue = {
    intTarget: 1,
    color: getRandomColorFromPool(colorScheme.colorPool),
  };

  const index = useMemo(
    () => colorScheme.fields?.findIndex((s) => s.path == activePath),
    [activePath]
  );

  const shouldShowAddButton = Boolean(
    setting?.maskTargetsColors && setting.maskTargetsColors.length > 0
  );

  const useFieldMaskColors = useMemo(
    () =>
      Boolean(
        setting?.maskTargetsColors && setting.maskTargetsColors.length > 0
      ),
    [setting?.maskTargetsColors]
  );

  const onSyncUpdate = useCallback(
    (copy: MaskColorInput[]) => {
      if (copy && isValidMaskInput(copy)) {
        const newSetting = cloneDeep(colorScheme.fields ?? []);
        const idx = colorScheme.fields?.findIndex((s) => s.path == activePath);
        if (idx !== undefined && idx > -1) {
          newSetting[idx].maskTargetsColors = copy;
          setColorScheme({ ...colorScheme, fields: newSetting });
        } else {
          setColorScheme((cur) => ({
            ...cur,
            fields: [
              ...newSetting,
              { path: activePath, maskTargetsColors: copy },
            ],
          }));
        }
      }
    },
    [index, setColorScheme, activePath]
  );

  useEffect(() => {
    if (!values) {
      const copy = cloneDeep(colorScheme.fields);
      const idx = colorScheme.fields?.findIndex((s) => s.path == activePath);
      if (copy) {
        if (idx && idx > -1) {
          copy[idx].maskTargetsColors = [defaultValue];
          setColorScheme({ ...colorScheme, fields: copy });
        } else {
          setColorScheme({
            ...colorScheme,
            fields: [
              ...copy,
              { path: activePath, maskTargetsColors: [defaultValue] },
            ],
          });
        }
      }
    }
  }, [values]);

  if (isRGBMask) return null;

  return (
    <SectionWrapper>
      <Checkbox
        name={`Use custom colors for mask targets for ${activePath}`}
        value={useFieldMaskColors}
        setValue={(v: boolean) => {
          setSetting((cur) => {
            if (!cur) {
              cur = { maskTargetsColors: [] };
            }

            if (v) {
              cur = { ...cur, maskTargetsColors: [defaultValue] };
            } else if (!v) {
              cur = { ...cur, maskTargetsColors: [] };
            }
            return cur;
          });
        }}
      />
      {useFieldMaskColors && (
        <>
          <IdxColorList
            initialValue={values as MaskColorInput[]}
            values={values as MaskColorInput[]}
            style={FieldCHILD_STYLE}
            onValidate={validateIntMask}
            onSyncUpdate={onSyncUpdate}
            shouldShowAddButton={shouldShowAddButton}
            min={1}
            max={255}
            step={1}
          />
        </>
      )}
    </SectionWrapper>
  );
};

export default FieldsMaskTargets;
