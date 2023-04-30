import React from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";

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
import { isValidColor } from "@fiftyone/looker/src/overlays/util";
import {
  ModalActionButtonContainer,
  BUTTON_STYLE,
  LONG_BUTTON_STYLE,
  ButtonGroup,
} from "./ShareStyledDiv";

type Prop = {
  eligibleFields: Field[];
};

const ColorFooter: React.FC<Prop> = ({ eligibleFields }) => {
  const [sessionColorSchemeState, setSessionColorSchemeState] = useRecoilState(
    fos.sessionColorScheme
  );
  const setColorScheme = fos.useSessionColorScheme();
  const clearSetting = fos.useClearSessionColorScheme();

  const activeColorModalField = useRecoilValue(fos.activeColorField);
  const tempGlobalSettings = useRecoilValue(tempGlobalSetting);
  const json = useRecoilValue(tempColorJSON);
  const tempColor = useRecoilValue(tempColorSetting);
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

  const fullSetting =
    useRecoilValue(fos.sessionColorScheme).customizedColorSettings ?? [];

  const onCancel = useCancel();

  const onSave = () => {
    onApply(true);
    onCancel();
  };

  const onClearSave = () => {
    clearSetting(true);
    onCancel();
  };

  const onApply = (saveToApp: boolean = false) => {
    if (typeof activeColorModalField !== "string") {
      // save field settings (update tempcolor by checkbox options)
      const update = updateFieldSettings(tempColor);
      const customizeColorSettings =
        fullSetting?.filter(
          (s) => s.field === (activeColorModalField as Field).path
        ).length > 0
          ? fullSetting?.map((s) =>
              s.field === (activeColorModalField as Field).path ? update : s
            )
          : [...fullSetting, update];

      setSessionColorSchemeState((prev) => {
        const newCustomizedColorSettings = (prev.customizedColorSettings ?? [])
          .filter((s) => s.field !== (activeColorModalField as Field).path)
          .concat(update);
        return {
          colorPool: prev.colorPool,
          customizedColorSettings: newCustomizedColorSettings,
          saveToApp,
        };
      });
      setColorScheme(
        tempGlobalSettings.colors,
        customizeColorSettings,
        saveToApp
      );
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

      setSessionColorSchemeState((prev) => ({
        ...prev,
        colorPool: colors,
        saveToApp,
      }));
      setColorScheme(colors, fullSetting, saveToApp);
    }
    if (activeColorModalField == "json") {
      if (
        typeof json !== "object" ||
        !json?.colorPool ||
        !Array.isArray(json?.colorPool) ||
        !json?.customizedColorSettings ||
        !Array.isArray(json?.customizedColorSettings)
      )
        return;
      const { colorPool, customizedColorSettings } = json;
      const validColors = colorPool?.filter((c) => isValidColor(c));
      const validated = validateJSONSetting(
        customizedColorSettings,
        eligibleFields
      );
      const newColors =
        validColors.length > 0
          ? validColors
          : sessionColorSchemeState.colorPool;
      const newCustomizedColorSettings =
        validated ?? sessionColorSchemeState.customizedColorSettings;
      setColoring(newColors);
      setSessionColorSchemeState({
        colorPool: newColors,
        customizedColorSettings: newCustomizedColorSettings,
        saveToApp,
      });
      setColorScheme(newColors, newCustomizedColorSettings, saveToApp);
    }
  };

  if (!activeColorModalField) return null;

  return (
    <ModalActionButtonContainer>
      <ButtonGroup>
        <Button
          text={"Apply"}
          title={`Apply`}
          onClick={() => onApply(false)}
          style={BUTTON_STYLE}
        />
        <Button
          text={"Clear"}
          title={`Clear`}
          onClick={() => clearSetting(false)}
          style={BUTTON_STYLE}
        />
      </ButtonGroup>
      <ButtonGroup>
        <Button
          text={"Save as default"}
          title={`Save to dataset`}
          onClick={onSave}
          style={LONG_BUTTON_STYLE}
        />
        <Button
          text={"Clear saved"}
          title={`Clear`}
          onClick={onClearSave}
          style={LONG_BUTTON_STYLE}
        />
        <Button
          text={"Close"}
          title={`Close`}
          onClick={onCancel}
          style={BUTTON_STYLE}
        />
      </ButtonGroup>
    </ModalActionButtonContainer>
  );
};

export default ColorFooter;
