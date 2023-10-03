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
import { v4 as uuid } from "uuid";
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
  const defaultColorPool = useRecoilValue(fos.config).colorPool;
  const datasetDefault = useRecoilValue(fos.datasetAppConfig).colorScheme;
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
            setColorScheme(
              datasetDefault || { fields: [], colorPool: defaultColorPool }
            );
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
              fields: colorScheme.fields || [],
              colorPool: colorScheme.colorPool || [],
            });

            setDatasetColorScheme({
              variables: {
                subscription,
                datasetName,
                colorScheme: {
                  fields: colorScheme.fields || [],
                  colorPool: colorScheme.colorPool || [],
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
              setColorScheme({ fields: [], colorPool: defaultColorPool });
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
            const fields = colorScheme?.fields?.map((field) => {
              const record = store.create(uuid(), "CustomizeColor");
              Object.entries(field).forEach((key, value) => {
                // @ts-ignore
                record.setValue(value, key);
              });

              return record;
            });

            colorSchemeRecord.setLinkedRecords(fields, "fields");
            colorSchemeRecord.setValue(
              [...(colorScheme.colorPool || [])],
              "colorPool"
            );
          });
      },
    [environment]
  );
};

export default ColorFooter;
