/**
 * Bridges Recoil's `datasetName` into the Jotai `schemaDatasetName` atom
 * that scopes the label-schema atoms (a Jotai getter can't read Recoil —
 * the same pattern as `exploreActiveFields`). Mount once at app level
 * (`SchemaManagerOutlet`), for every viewer.
 */

import * as fos from "@fiftyone/state";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { schemaDatasetName } from "./state";

export const useSyncSchemaDataset = (): void => {
  const datasetName = useRecoilValue(fos.datasetName);
  const setSchemaDataset = useSetAtom(schemaDatasetName);

  useEffect(() => {
    setSchemaDataset(datasetName ?? null);
  }, [datasetName, setSchemaDataset]);
};
