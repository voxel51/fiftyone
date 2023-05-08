import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Button } from "../utils";
import {
  ButtonGroup,
  LONG_BUTTON_STYLE,
  ModalActionButtonContainer,
} from "./ShareStyledDiv";

const ColorFooter: React.FC = () => {
  const setting = useRecoilValue(fos.sessionColorScheme);
  const canEdit = useRecoilValue(fos.canEditCustomColors);
  const { setColorScheme } = fos.useSessionColorScheme();
  const clearSetting = fos.useClearSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );

  const onSave = () => {
    setColorScheme(setting.colorPool, setting.customizedColorSettings, true);
    setActiveColorModalField(null);
  };

  const onClearSave = () => {
    clearSetting(true);
    setActiveColorModalField(null);
  };

  if (!activeColorModalField) return null;

  return (
    <ModalActionButtonContainer>
      <ButtonGroup>
        <Button
          text={"Reset Colorscheme"}
          title={`Clear session settings and revert to default settings`}
          onClick={() => clearSetting(false)}
          style={LONG_BUTTON_STYLE}
        />
        {canEdit && (
          <Button
            text={"Save as default"}
            title={`Save to dataset appConfig`}
            onClick={onSave}
            style={LONG_BUTTON_STYLE}
          />
        )}
        {canEdit && (
          <Button
            text={"Clear saved"}
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
