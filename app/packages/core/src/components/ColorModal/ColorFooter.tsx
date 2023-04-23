import React from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import * as fos from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";

import { Button } from "../utils";
import {
  tempColorJSON,
  tempColorSetting,
  tempGlobalSetting,
  updateFieldSettings,
  validateJSONSetting,
} from "./utils";
import { CustomizeColor } from "@fiftyone/state";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { ModalActionButtonContainer, BUTTON_STYLE } from "./ShareStyledDiv";

type Prop = {
  eligibleFields: Field[];
};

const onCancel = () => {
  return useRecoilCallback(({ set }) => async () => {
    set(fos.activeColorField, null);
    set(tempColorSetting, null);
    set(tempGlobalSetting, null);
    set(tempColorJSON, null);
  });
};

const ColorFooter: React.FC<Prop> = ({ eligibleFields }) => {
  const [sessionColorPool, sessionCustomizedColors, setColorScheme] =
    fos.useSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  const [tempGlobalSettings, setTempGlobalSettings] =
    useRecoilState(tempGlobalSetting);
  const [json, setJson] = useRecoilState(tempColorJSON);
  const customizeColorFields = useRecoilValue(fos.customizeColorFields);
  const path =
    typeof activeColorModalField === "string"
      ? activeColorModalField
      : activeColorModalField?.path;

  const [tempColor, setTempColor] = useRecoilState(tempColorSetting);
  const setAlpha = useSetRecoilState(fos.alpha(false));
  const setConfigColorBy = useSetRecoilState(
    fos.appConfigOption({ modal: false, key: "colorBy" })
  );
  const setShowSkeleton = useSetRecoilState(
    fos.appConfigOption({ key: "showSkeletons", modal: false })
  );
  const setMulticolorKeypoints = useSetRecoilState(
    fos.appConfigOption({ key: "multicolorKeypoints", modal: false })
  );
  const setColoring = useSetRecoilState(fos.colorPalette);
  const setCustomizeColor = useSetRecoilState(
    fos.customizeColorSelector(path!)
  );

  console.info("session", sessionColorPool, sessionCustomizedColors);

  const onSave = () => {
    onApply();
    onCancel();
  };

  const onApply = () => {
    if (typeof activeColorModalField !== "string") {
      // save field settings (update tempcolor by checkbox options)
      const update = updateFieldSettings(tempColor);
      setCustomizeColor(update);
    }
    if (activeColorModalField == "global") {
      // save global settings
      const { colorBy, colors, opacity, useMulticolorKeypoints, showSkeleton } =
        tempGlobalSettings ?? {};
      setConfigColorBy(colorBy);
      setColoring(colors);
      setAlpha(opacity);
      setMulticolorKeypoints(useMulticolorKeypoints);
      setShowSkeleton(showSkeleton);
    }
    if (activeColorModalField == "json") {
      if (
        typeof json !== "object" ||
        !json?.colors ||
        !Array.isArray(json?.colors) ||
        !json?.customizedColorSettings ||
        !Array.isArray(json?.customizedColorSettings)
      )
        return;
      const { colors, customizedColorSettings } = json;
      // update color palette
      const validColors = colors?.filter((c) => isValidColor(c));
      validColors.length > 0 && setColoring(validColors);
      // validate customizedColorSettings
      const validated = validateJSONSetting(
        customizedColorSettings,
        eligibleFields
      );
      if (validated) {
        resetCustomizeColors(validated);
        validated.forEach((update) => setCustomizeColor(update));
        setColorScheme(validColors, validated);
      }
    }
  };

  const resetCustomizeColors =
    useOverwriteCustomizeColors(customizeColorFields);

  function useOverwriteCustomizeColors(customizeColorFields: string[]) {
    return useRecoilCallback(({ set }) => (newValues: CustomizeColor[]) => {
      const newKeys = newValues.map((v) => v.field);
      customizeColorFields.forEach((key) => {
        if (newKeys.includes(key)) {
          set(
            fos.customizeColorSelector(key),
            newValues.find((v) => v.field === key)!
          );
        } else {
          set(fos.customizeColorSelector(key), {});
        }
      });
    });
  }

  if (!activeColorModalField) return null;

  return (
    <ModalActionButtonContainer>
      <Button
        text={"Apply"}
        title={`Apply`}
        onClick={onApply}
        style={BUTTON_STYLE}
      />
      <Button
        text={"Save"}
        title={`Save`}
        onClick={onSave}
        style={BUTTON_STYLE}
      />
      <Button
        text={"Close"}
        title={`Close`}
        onClick={onCancel}
        style={BUTTON_STYLE}
      />
    </ModalActionButtonContainer>
  );
};

export default ColorFooter;
