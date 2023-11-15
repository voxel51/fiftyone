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
  const [setting, setSetting] = useRecoilState(fieldColorSetting(activePath));

  const values = setting?.maskTargetsColors ?? [];

  const defaultValue = {
    intTarget: 1,
    color: getRandomColorFromPool(colorScheme.colorPool),
  };

  const useFieldMaskColors = Boolean(setting?.maskTargetsColors?.length);
  // Utility function to update the color scheme
  const updateColorScheme = useCallback(
    (maskTargetsColors) => {
      setSetting((currentSetting) => {
        return {
          ...currentSetting,
          maskTargetsColors: maskTargetsColors,
        };
      });
    },
    [setSetting]
  );

  const onSyncUpdate = useCallback(
    (copy: MaskColorInput[]) => {
      if (copy && isValidMaskInput(copy)) {
        updateColorScheme(copy);
      }
    },
    [updateColorScheme]
  );

  useEffect(() => {
    if (!values) {
      updateColorScheme([defaultValue]);
    }
  }, [values, defaultValue, updateColorScheme]);

  if (isRGBMask) return null;

  return (
    <SectionWrapper>
      <Checkbox
        name={`Use custom colors for mask targets for ${activePath}`}
        value={useFieldMaskColors}
        setValue={(v: boolean) => {
          setSetting((cur) => ({
            ...(cur ?? {}),
            maskTargetsColors: v ? [defaultValue] : [],
          }));
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
            shouldShowAddButton={useFieldMaskColors}
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
