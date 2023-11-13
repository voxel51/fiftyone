import { Button } from "@fiftyone/components";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useMutation } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import { ButtonGroup, ModalActionButtonContainer } from "./ShareStyledDiv";
import { activeColorEntry } from "./state";

const ColorFooter: React.FC = () => {
  const isReadOnly = useRecoilValue(fos.readOnly);
  const canEditCustomColors = useRecoilValue(fos.canEditCustomColors);
  const canEdit = useMemo(
    () => !isReadOnly && canEditCustomColors,
    [canEditCustomColors, isReadOnly]
  );
  const setColorScheme = fos.useSetSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] =
    useRecoilState(activeColorEntry);
  const [setDatasetColorScheme] =
    useMutation<foq.setDatasetColorSchemeMutation>(foq.setDatasetColorScheme);
  const colorScheme = useRecoilValue(fos.colorScheme);
  const datasetName = useRecoilValue(fos.datasetName);
  const configDefault = useRecoilValue(fos.config);
  const datasetDefault = useRecoilValue(fos.datasetAppConfig)?.colorScheme;
  const subscription = useRecoilValue(fos.stateSubscription);

  if (!activeColorModalField) return null;

  console.info("datasetd", datasetDefault?.fields);

  if (!datasetName) {
    throw new Error("dataset not defined");
  }
  return (
    <ModalActionButtonContainer>
      <ButtonGroup style={{ marginRight: "4px" }}>
        <Button
          title={`Clear session settings and revert to default settings`}
          onClick={() => {
            setColorScheme(fos.ensureColorScheme(datasetDefault));
          }}
        >
          Reset
        </Button>
        <Button
          title={
            canEdit
              ? "Save to dataset app config"
              : "Can not save to dataset appConfig in read-only mode"
          }
          onClick={() => {
            setDatasetColorScheme({
              variables: {
                subscription,
                datasetName,
                colorScheme: {
                  ...colorScheme,
                  fields: colorScheme.fields ?? [],
                  multicolorKeypoints: colorScheme.multicolorKeypoints ?? false,
                  showSkeletons: colorScheme.showSkeletons ?? true,
                  colorBy: colorScheme.colorBy ?? "field",
                  colorPool: colorScheme.colorPool ?? [],
                  labelTags: colorScheme.labelTags ?? {},
                  defaultMaskTargetsColors:
                    colorScheme.defaultMaskTargetsColors ?? [],
                },
              },
            });
            setActiveColorModalField(null);
          }}
          disabled={!canEdit}
        >
          Save as default
        </Button>
        {datasetDefault && (
          <Button
            title={canEdit ? "Clear" : "Can not clear in read-only mode"}
            onClick={() => {
              setDatasetColorScheme({
                variables: { subscription, datasetName, colorScheme: null },
              });
              setColorScheme((cur) => ({
                ...cur,
                fields: [],
                defaultMaskTargetsColors: [],
                labelTags: {},
                colorPool: configDefault.colorPool,
                colorBy: configDefault.colorBy ?? "field",
                multicolorKeypoints: false,
                showSkeletons: true,
              }));
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
