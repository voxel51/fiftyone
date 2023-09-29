import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import { Button } from "@fiftyone/components";
import { ButtonGroup, ModalActionButtonContainer } from "./ShareStyledDiv";
import { isDefaultSetting } from "./utils";

// this reset is used to trigger a sync of local state input with the session color values
export const resetColor = atom<number>({
  key: "resetColor",
  default: 0,
});

const ColorFooter: React.FC = () => {
  const isReadOnly = useRecoilValue(fos.readOnly);
  const canEditCustomColors = useRecoilValue(fos.canEditCustomColors);
  const canEdit = useMemo(
    () => !isReadOnly && canEditCustomColors,
    [canEditCustomColors, isReadOnly]
  );
  const setColorScheme = fos.useSetSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  const savedSettings = useRecoilValue(fos.datasetAppConfig).colorScheme;
  const colorScheme = useRecoilValue(fos.sessionColorScheme);
  const setReset = useSetRecoilState(resetColor);

  const hasSavedSettings = useMemo(() => {
    if (!savedSettings) return false;
    if (isDefaultSetting(savedSettings)) return false;
    return true;
  }, [savedSettings]);

  // set to be true only for teams
  const isTeams = useRecoilValue(fos.compactLayout);
  const datasetDefault =
    useRecoilValue(fos.datasetAppConfig)?.colorScheme ?? null;

  if (!activeColorModalField) return null;

  return (
    <ModalActionButtonContainer>
      <ButtonGroup style={{ marginRight: "4px" }}>
        <Button
          title={`Clear session settings and revert to default settings`}
          onClick={() => {
            setColorScheme(false, isTeams ? datasetDefault : null);
            setReset((prev) => prev + 1);
          }}
        >
          Reset
        </Button>
        <Button
          title={
            canEdit
              ? `Save to dataset appConfig`
              : "Can not save to dataset appConfig in read-only mode"
          }
          onClick={() => {
            setColorScheme(true, colorScheme);
            setActiveColorModalField(null);
          }}
          disabled={!canEdit}
        >
          Save as default
        </Button>
        {hasSavedSettings && (
          <Button
            title={canEdit ? "Clear" : "Can not clear in read-only mode"}
            onClick={() => {
              setColorScheme(true, null);
              setReset((prev) => prev + 1);
            }}
            disabled={!canEdit}
          >
            Clear default
          </Button>
        )}
      </ButtonGroup>
    </ModalActionButtonContainer>
  );
};

export default ColorFooter;
