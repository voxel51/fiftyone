import { Button } from "@fiftyone/components";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useEffect } from "react";
import { useMutation } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import { ButtonGroup, ModalActionButtonContainer } from "./ShareStyledDiv";
import { activeColorEntry } from "./state";

const ColorFooter: React.FC = () => {
  const canEditCustomColors = useRecoilValue(fos.canEditCustomColors);
  const disabled = canEditCustomColors.enabled! == true;
  const title = disabled
    ? canEditCustomColors.message ?? ""
    : "Save to dataset app config";
  const setColorScheme = fos.useSetSessionColorScheme();
  const [activeColorModalField, setActiveColorModalField] =
    useRecoilState(activeColorEntry);
  const [setDatasetColorScheme] =
    useMutation<foq.setDatasetColorSchemeMutation>(foq.setDatasetColorScheme);
  const colorScheme = useRecoilValue(fos.colorScheme);
  const datasetName = useRecoilValue(fos.datasetName);
  const configDefault = useRecoilValue(fos.config);
  const id = fos.useAssertedRecoilValue(fos.dataset).id;
  const datasetDefault = useRecoilValue(fos.datasetColorScheme);
  const subscription = useRecoilValue(fos.stateSubscription);

  useEffect(
    () => foq.subscribe(() => setActiveColorModalField(null)),
    [setActiveColorModalField]
  );

  if (!activeColorModalField) return null;
  if (!datasetName) {
    throw new Error("dataset not defined");
  }
  return (
    <ModalActionButtonContainer>
      <ButtonGroup style={{ marginRight: "4px" }}>
        <Button
          title={`Clear session settings and revert to default settings`}
          onClick={() => {
            const { id: _, ...update } = fos.ensureColorScheme(
              datasetDefault,
              configDefault
            );
            setColorScheme({
              id: colorScheme.id,
              ...update,
            });
          }}
        >
          Reset
        </Button>
        <Button
          title={title}
          onClick={() => {
            // remove rgb list from defaultColorscale and colorscales
            const { rgb, ...rest } = colorScheme.defaultColorscale;
            const newDefaultColorscale = rest;
            const newColorscales = colorScheme.colorscales?.length
              ? colorScheme.colorscales?.map(({ rgb, ...rest }) => rest)
              : [];

            setDatasetColorScheme({
              variables: {
                subscription,
                datasetName,
                colorScheme: {
                  ...colorScheme,
                  id: datasetDefault?.id ?? null,
                  colorBy: colorScheme.colorBy ?? "field",
                  colorPool: colorScheme.colorPool ?? [],
                  colorscales: colorScheme.colorscales ? newColorscales : [],
                  defaultMaskTargetsColors:
                    colorScheme.defaultMaskTargetsColors ?? [],
                  defaultColorscale: newDefaultColorscale ?? {
                    name: "virdis",
                    list: [],
                  },
                  fields: colorScheme.fields ?? [],
                  labelTags: colorScheme.labelTags ?? {},
                  multicolorKeypoints: colorScheme.multicolorKeypoints ?? false,
                  showSkeletons: colorScheme.showSkeletons ?? true,
                },
              },
              updater: (store, { setDatasetColorScheme }) => {
                const datasetRecord = store.get(id);
                const config = datasetRecord?.getLinkedRecord("appConfig");
                if (!config) {
                  console.error(
                    "dataset.appConfig record not found and thus can not be updated"
                  );
                  return;
                }
                if (!datasetDefault && setDatasetColorScheme) {
                  const record = store.get(setDatasetColorScheme.id);
                  record && config!.setLinkedRecord(record, "colorScheme");
                }
              },
            });
            setActiveColorModalField(null);
          }}
          disabled={disabled}
        >
          Save as default
        </Button>
        {datasetDefault && !disabled && (
          <Button
            title="Clear"
            onClick={() => {
              setDatasetColorScheme({
                variables: { subscription, datasetName, colorScheme: null },
                updater: (store) => {
                  store.delete(datasetDefault.id);
                },
              });
              setColorScheme((cur) => ({
                ...cur,
                colorPool: configDefault.colorPool,
                colorBy: configDefault.colorBy ?? "field",
                colorscales: [],
                defaultColorscale: {
                  name: configDefault.colorscale ?? "virdis",
                  list: [],
                },
                defaultMaskTargetsColors: [],
                fields: [],
                labelTags: {},
                multicolorKeypoints: configDefault.multicolorKeypoints ?? false,
                showSkeletons: configDefault.showSkeletons ?? true,
              }));
            }}
          >
            Clear default
          </Button>
        )}
      </ButtonGroup>
    </ModalActionButtonContainer>
  );
};

export default ColorFooter;
