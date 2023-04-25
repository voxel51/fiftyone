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
  useCancel,
  validateJSONSetting,
} from "./utils";
import { CustomizeColor } from "@fiftyone/state";
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import { ModalActionButtonContainer, BUTTON_STYLE } from "./ShareStyledDiv";

type Prop = {
  eligibleFields: Field[];
};

const ColorFooter: React.FC<Prop> = ({ eligibleFields }) => {
  const [sessionColorSchemeState, setSessionColorSchemeState] = useRecoilState(
    fos.sessionColorScheme
  );
  const [sessionColorPool, sessionCustomizedColors, setColorScheme] =
    fos.useSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  const [tempGlobalSettings, setTempGlobalSettings] =
    useRecoilState(tempGlobalSetting);
  const [json, setJson] = useRecoilState(tempColorJSON);
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

  const fullSetting = useRecoilValue(
    fos.sessionColorScheme
  ).customizedColorSettings;

  const onCancel = useCancel();

  const onSave = () => {
    onApply();
    onCancel();
  };

  const onApply = () => {
    if (typeof activeColorModalField !== "string") {
      // save field settings (update tempcolor by checkbox options)
      const update = updateFieldSettings(tempColor);
      const customizeColorSettings =
        fullSetting.filter(
          (s) => s.field === (activeColorModalField as Field).path
        ).length > 0
          ? fullSetting.map((s) =>
              s.field === (activeColorModalField as Field).path ? update : s
            )
          : [...fullSetting, update];
      setSessionColorSchemeState((prev) => {
        const newCustomizedColorSettings = prev.customizedColorSettings
          .filter((s) => s.field !== (activeColorModalField as Field).path)
          .concat(update);
        return {
          colorPool: prev.colorPool,
          customizedColorSettings: newCustomizedColorSettings,
        };
      });
      setColorScheme(tempGlobalSettings.colors, customizeColorSettings);
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
      // update colors
      setSessionColorSchemeState((prev) => ({ ...prev, colorPool: colors }));
      setColorScheme(colors, fullSetting);
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
        setSessionColorSchemeState((prev) => ({
          colorPool: validColors,
          customizedColorSettings: validated ?? prev.customizedColorSettings,
        }));
        setColorScheme(validColors, validated);
      }
    }
  };

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
