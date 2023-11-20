import { Button } from "@fiftyone/components";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useEffect, useMemo } from "react";
import { useMutation } from "react-relay";
import { useRecoilState, useRecoilValue } from "recoil";
import { ButtonGroup, ModalActionButtonContainer } from "./ShareStyledDiv";
import { activeColorEntry } from "./state";
import { v4 as uuid } from "uuid";

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
  const datasetId = fos.useAssertedRecoilValue(fos.datasetId);
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
          title={
            canEdit
              ? "Save to dataset app config"
              : "Can not save to dataset appConfig in read-only mode"
          }
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
                  id: datasetDefault?.id,
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
                const datasetRecord = store.get(datasetId);
                const config = datasetRecord?.getLinkedRecord("appConfig");
                if (!datasetDefault && setDatasetColorScheme) {
                  const fragment =
                    foq.readFragment<foq.colorSchemeFragment$key>(
                      foq.colorSchemeFragment,
                      setDatasetColorScheme
                    );

                  const record = store.get(fragment.id);
                  record && config?.setLinkedRecord(record, "colorScheme");
                }
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
