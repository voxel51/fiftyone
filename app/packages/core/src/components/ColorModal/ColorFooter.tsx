import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import { Button } from "../utils";
import {
  ButtonGroup,
  LONG_BUTTON_STYLE,
  ModalActionButtonContainer,
  BUTTON_STYLE,
} from "./ShareStyledDiv";
import { isDefaultSetting } from "./utils";

const ColorFooter: React.FC = () => {
  const canEdit = useRecoilValue(fos.canEditCustomColors);
  const setColorScheme = fos.useSetSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  const savedSettings = useRecoilValue(fos.datasetAppConfig).colorScheme;
  const colorScheme = useRecoilValue(fos.sessionColorScheme);

  const onSave = () => {
    setColorScheme(true, colorScheme);
    setActiveColorModalField(null);
  };

  const onClearSave = () => {
    setColorScheme(true, null);
  };

  const hasSavedSettings = useMemo(() => {
    if (!savedSettings) return false;
    if (isDefaultSetting(savedSettings)) return false;
    return true;
  }, [savedSettings]);

  if (!activeColorModalField) return null;

  return (
    <ModalActionButtonContainer>
      <ButtonGroup>
        <Button
          text={"Reset"}
          title={`Clear session settings and revert to default settings`}
          onClick={() => setColorScheme(false, null)}
          style={BUTTON_STYLE}
        />
        {canEdit && (
          <Button
            text={"Save as default"}
            title={`Save to dataset appConfig`}
            onClick={onSave}
            style={LONG_BUTTON_STYLE}
          />
        )}
        {canEdit && hasSavedSettings && (
          <Button
            text={"Clear default"}
            title={`Clear`}
            onClick={onClearSave}
            style={LONG_BUTTON_STYLE}
          />
        )}
      </ButtonGroup>
    </ModalActionButtonContainer>
  );
};

export default ColorFooter;
