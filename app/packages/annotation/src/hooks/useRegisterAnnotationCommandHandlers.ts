/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventBus } from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { JSONDeltas, patchSample } from "@fiftyone/core/src/client";
import { transformSampleData } from "@fiftyone/core/src/client/transformer";
import { parseTimestamp } from "@fiftyone/core/src/client/util";
import { Sample } from "@fiftyone/looker";
import { isSampleIsh } from "@fiftyone/looker/src/util";
import {
  AnnotationLabel,
  datasetId as fosDatasetId,
  modalSample,
  useRefreshSample,
} from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { DeleteAnnotationCommand, UpsertAnnotationCommand } from "../commands";
import { OpType, buildJsonPath, buildLabelDeltas } from "../deltas";

/**
 * Hook that registers command handlers for annotation persistence.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationCommandHandlers = () => {
  const datasetId = useRecoilValue(fosDatasetId);
  const refreshSample = useRefreshSample();
  const eventBus = useAnnotationEventBus();

  // The annotation endpoint requires a version token in order to execute
  // mutations.
  // Updated version tokens are returned in the response body,
  // but the server also allows the current sample timestamp to be used as
  // a version token.
  const getVersionToken = useRecoilCallback(
    ({ snapshot }) =>
      async (): Promise<string | undefined> => {
        const currentSample = (await snapshot.getPromise(modalSample))?.sample;
        if (!currentSample?.last_modified_at) {
          return undefined;
        }

        const isoTimestamp = parseTimestamp(
          currentSample.last_modified_at as unknown as string
        )?.toISOString();

        // server doesn't like the iso timestamp ending in 'Z'
        if (isoTimestamp?.endsWith("Z")) {
          return isoTimestamp.substring(0, isoTimestamp.length - 1);
        } else {
          return isoTimestamp;
        }
      },
    []
  );

  const handlePatchSample = useRecoilCallback(
    ({ snapshot }) =>
      async (sampleDeltas: JSONDeltas): Promise<boolean> => {
        const currentSample = (await snapshot.getPromise(modalSample))?.sample;
        const versionToken = await getVersionToken();

        if (!datasetId || !currentSample?._id || !versionToken) {
          return false;
        }

        if (sampleDeltas.length > 0) {
          try {
            const response = await patchSample({
              datasetId,
              sampleId: currentSample._id,
              deltas: sampleDeltas,
              versionToken,
            });

            // transform response data to match the graphql sample format
            const cleanedSample = transformSampleData(response.sample);
            if (isSampleIsh(cleanedSample)) {
              refreshSample(cleanedSample as Sample);
            } else {
              console.error(
                "response data does not adhere to sample format",
                cleanedSample
              );
            }
          } catch (error) {
            console.error("error patching sample", error);

            return false;
          }
        }

        return true;
      },
    [datasetId, refreshSample, getVersionToken]
  );

  // callback which handles both mutation (upsert) and deletion
  const handlePersistence = useRecoilCallback(
    ({ snapshot }) =>
      async (
        annotationLabel: AnnotationLabel,
        schema: Field,
        opType: OpType
      ): Promise<boolean> => {
        const currentSample = (await snapshot.getPromise(modalSample))?.sample;

        if (!currentSample) {
          console.error("missing sample data!");
          return false;
        }

        if (!annotationLabel) {
          console.error("missing annotation label!");
          return false;
        }

        // calculate label deltas between current sample data and new label data
        const sampleDeltas = buildLabelDeltas(
          currentSample,
          annotationLabel,
          schema,
          opType
        ).map((delta) => ({
          ...delta,
          // convert label delta to sample delta
          path: buildJsonPath(annotationLabel.path, delta.path),
        }));

        return await handlePatchSample(sampleDeltas);
      },
    [handlePatchSample]
  );

  useRegisterCommandHandler(
    UpsertAnnotationCommand,
    useCallback(
      async (cmd) => {
        const labelId = cmd.label.data._id;
        try {
          const success = await handlePersistence(
            cmd.label,
            cmd.schema,
            "mutate"
          );

          if (success) {
            eventBus.dispatch("annotation:notification:upsertSuccess", {
              labelId,
              type: "upsert",
            });
          } else {
            eventBus.dispatch("annotation:notification:upsertError", {
              labelId,
              type: "upsert",
            });
          }
          return success;
        } catch (error) {
          eventBus.dispatch("annotation:notification:upsertError", {
            labelId,
            type: "upsert",
            error: error as Error,
          });
          throw error;
        }
      },
      [handlePersistence, eventBus]
    )
  );

  useRegisterCommandHandler(
    DeleteAnnotationCommand,
    useCallback(
      async (cmd) => {
        const labelId = cmd.label.data._id;
        try {
          const success = await handlePersistence(
            cmd.label,
            cmd.schema,
            "delete"
          );

          if (success) {
            eventBus.dispatch("annotation:notification:deleteSuccess", {
              labelId,
              type: "delete",
            });
          } else {
            eventBus.dispatch("annotation:notification:deleteError", {
              labelId,
              type: "delete",
            });
          }
          return success;
        } catch (error) {
          eventBus.dispatch("annotation:notification:deleteError", {
            labelId,
            type: "delete",
            error: error as Error,
          });
          throw error;
        }
      },
      [handlePersistence, eventBus]
    )
  );
};
