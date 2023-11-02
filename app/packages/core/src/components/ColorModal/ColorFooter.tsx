import { Button } from "@fiftyone/components";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import {
  commitLocalUpdate,
  useMutation,
  useRelayEnvironment,
} from "react-relay";
import { useRecoilCallback, useRecoilState, useRecoilValue } from "recoil";
import { RecordSourceProxy } from "relay-runtime";
import { v4 as uuid } from "uuid";
import { ButtonGroup, ModalActionButtonContainer } from "./ShareStyledDiv";
import { activeColorEntry } from "./state";
import { COLOR_BY } from "@fiftyone/utilities";

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
  const updateDatasetColorScheme = useUpdateDatasetColorScheme();
  const subscription = useRecoilValue(fos.stateSubscription);

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
            updateDatasetColorScheme({
              ...colorScheme,
              fields: colorScheme.fields ?? [],
              labelTags: colorScheme.labelTags ?? {},
              colorPool:
                colorScheme.colorPool ?? fos.appConfigDefault.colorPool ?? [],
              colorBy: colorScheme.colorBy ?? "field",
              multicolorKeypoints: colorScheme.multicolorKeypoints ?? false,
              showSkeletons: colorScheme.showSkeletons ?? true,
              defaultMaskTargetsColors:
                colorScheme.defaultMaskTargetsColors ?? [],
            });
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
              updateDatasetColorScheme(null);
              setDatasetColorScheme({
                variables: { subscription, datasetName, colorScheme: null },
              });
              setColorScheme((cur) => ({
                ...cur,
                fields: [],
                defaultMaskTargetsColors: [],
                labelTags: {},
                colorscale: null,
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

const useUpdateDatasetColorScheme = () => {
  const environment = useRelayEnvironment();

  return useRecoilCallback(
    ({ snapshot }) =>
      async (colorScheme: foq.ColorSchemeInput | null) => {
        const id = (await snapshot.getPromise(fos.dataset))?.id;
        id &&
          commitLocalUpdate(environment, (store) => {
            const appConfigRecord = store
              .get<foq.datasetFragment$data>(id)
              ?.getLinkedRecord("appConfig");

            if (!appConfigRecord) {
              throw new Error("app config not found");
            }

            if (!colorScheme) {
              appConfigRecord.setValue(null, "colorScheme");
              return;
            }
            let colorSchemeRecord =
              appConfigRecord.getLinkedRecord("colorScheme");

            if (!colorSchemeRecord) {
              colorSchemeRecord = store.create(uuid(), "ColorScheme");
              appConfigRecord.setLinkedRecord(colorSchemeRecord, "colorScheme");
            }
            colorSchemeRecord.setValue(colorScheme.colorBy, "colorBy");
            colorSchemeRecord.setValue(
              [...(colorScheme.colorPool || [])],
              "colorPool"
            );
            colorSchemeRecord.setLinkedRecords(
              setEntries(store, "CustomizeColor", colorScheme?.fields ?? null),
              "fields"
            );
            colorSchemeRecord.setLinkedRecords(
              setEntries(
                store,
                "DefaultMaskTargetsColors",
                colorScheme?.defaultMaskTargetsColors ?? null
              ),
              "defaultMaskTargetsColors"
            );

            // get or create labelTags data
            let labelTagsRecord =
              colorSchemeRecord.getLinkedRecord("labelTags");
            if (!labelTagsRecord) {
              labelTagsRecord = store.create(uuid(), "LabelTagColor");
              colorSchemeRecord.setLinkedRecord(labelTagsRecord, "labelTags");
            }

            labelTagsRecord.setValue(
              colorScheme.labelTags?.fieldColor,
              "fieldColor"
            );
            labelTagsRecord.setLinkedRecords(
              setEntries(
                store,
                "ValueColors",
                colorScheme.labelTags?.valueColors ?? null
              ),
              "valueColors"
            );

            colorSchemeRecord.setValue(
              colorScheme.multicolorKeypoints,
              "multicolorKeypoints"
            );
            colorSchemeRecord.setValue(colorScheme.opacity, "opacity");
            colorSchemeRecord.setValue(
              colorScheme.showSkeletons,
              "showSkeletons"
            );
          });
      },
    [environment]
  );
};

const setEntries = (
  store: RecordSourceProxy,
  name: string,
  entries: readonly object[] | null
) =>
  entries?.map((entry) => {
    const record = store.create(uuid(), name);
    Object.entries(entry).forEach((key, value) => {
      // @ts-ignore
      record.setValue(value, key);
    });

    return record;
  });

export default ColorFooter;
