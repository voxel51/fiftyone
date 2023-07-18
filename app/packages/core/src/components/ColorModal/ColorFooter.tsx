import {
  setDatasetColorScheme,
  setDatasetColorSchemeMutation,
} from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React from "react";
import { useMutation } from "react-relay";
import { atom, useRecoilState, useRecoilValue } from "recoil";
import { Button } from "../utils";
import {
  BUTTON_STYLE,
  ButtonGroup,
  LONG_BUTTON_STYLE,
  ModalActionButtonContainer,
} from "./ShareStyledDiv";

// this reset is used to trigger a sync of local state input with the session color values
export const resetColor = atom<number>({
  key: "resetColor",
  default: 0,
});

const ColorFooter: React.FC = () => {
  const canEdit = useRecoilValue(fos.canEditCustomColors);
  const setColorScheme = fos.useSetSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] = useRecoilState(
    fos.activeColorField
  );
  const [setDataset] = useMutation<setDatasetColorSchemeMutation>(
    setDatasetColorScheme
  );
  const colorScheme = useRecoilValue(fos.colorScheme);
  const datasetName = useRecoilValue(fos.datasetName);
  const defaultColorPool = useRecoilValue(fos.defaultColorPool);

  const datasetDefault = useRecoilValue(fos.datasetColorScheme);
  if (!activeColorModalField) return null;

  if (!datasetName) {
    throw new Error("dataset not defined");
  }

  return (
    <ModalActionButtonContainer>
      <ButtonGroup>
        <Button
          text={"Reset"}
          title={`Clear session settings and revert to default settings`}
          onClick={() => {
            setColorScheme(
              datasetDefault || { fields: [], colorPool: defaultColorPool }
            );
          }}
          style={BUTTON_STYLE}
        />
        {canEdit && (
          <Button
            text={"Save as default"}
            title={`Save to dataset appConfig`}
            onClick={() => {
              setDataset({
                variables: {
                  datasetName,
                  colorScheme: {
                    fields: colorScheme.fields || [],
                    colorPool: colorScheme.colorPool || [],
                  },
                },
              });
              setActiveColorModalField(null);
            }}
            style={LONG_BUTTON_STYLE}
          />
        )}
        {canEdit && datasetDefault && (
          <Button
            text={"Clear default"}
            title={`Clear`}
            onClick={() => {
              setColorScheme({ fields: [], colorPool: defaultColorPool });
              setDataset({ variables: { datasetName, colorScheme: null } });
            }}
            style={LONG_BUTTON_STYLE}
          />
        )}
      </ButtonGroup>
    </ModalActionButtonContainer>
  );
};

export default ColorFooter;
