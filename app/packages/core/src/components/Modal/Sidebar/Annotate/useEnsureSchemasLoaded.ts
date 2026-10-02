/**
 * Lazy-load the label schemas at the dataset level.
 *
 * The primary loader is `useLoadSchemas` in `Sidebar.tsx`, which clears +
 * refetches whenever the user enters the Annotate sidebar inside a sample
 * modal. That loader doesn't run on the grid, so when the Schema Manager
 * is opened from the grid (`?schemaManager=open` via `SchemaManagerOutlet`)
 * the atoms stay `null` and downstream components like
 * `ActiveFieldsSection` hit "Maximum update depth exceeded".
 *
 * This hook is the minimal complement: a fetch that fills the atoms iff
 * they're currently null — which, because the atoms are scoped to the
 * dataset (see `schemaDatasetName`), is also the case right after a
 * dataset switch. It does NOT close the modal or clear existing data —
 * that responsibility stays with `useLoadSchemas`.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { activeLabelSchemas, labelSchemasData } from "./state";
import {
  operatorAsPromise,
  type ListSchemasRequest,
  type ListSchemasResponse,
  type Operator,
} from "./useSchemaManager";

export const useEnsureSchemasLoaded = (enabled: boolean): void => {
  const datasetName = useRecoilValue(fos.datasetName);
  const schemasData = useAtomValue(labelSchemasData);
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const get = useOperatorExecutor("get_label_schemas") as unknown as Operator<
    ListSchemasRequest,
    ListSchemasResponse
  >;

  // `useOperatorExecutor` returns a new object each render; read the
  // latest through a ref so the fetch effect is keyed on the dataset,
  // not on executor identity.
  const getRef = useRef(get);
  getRef.current = get;

  // Mirror the latest atom value into a ref so the in-flight request's
  // resolve callback can re-check synchronously: if another loader (e.g.
  // the modal's `useLoadSchemas`) populated the atoms while we were
  // waiting, we don't want to clobber their data with our stale fetch.
  const schemasDataRef = useRef(schemasData);
  schemasDataRef.current = schemasData;

  // The dataset as of the latest render: the atoms are scoped to it at
  // write time, so a result that lands after a dataset switch must be
  // dropped rather than written under the new dataset's name.
  const datasetRef = useRef(datasetName);
  datasetRef.current = datasetName;

  // One fetch per dataset at a time.
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !datasetName || schemasData !== null) return undefined;
    if (inFlightRef.current === datasetName) return undefined;
    inFlightRef.current = datasetName;

    // No "cancelled" flag: if the effect re-runs while the fetch is in
    // flight (e.g. `enabled` flips off and on) the in-flight guard above
    // returns early, so discarding this result would leave the atoms
    // null for good. The ref re-checks below are the only guards needed:
    // the dataset one drops a result that outlived a dataset switch, the
    // data one keeps a stale fetch from clobbering another loader's data.
    operatorAsPromise(getRef.current, {})
      .then((result) => {
        if (inFlightRef.current === datasetName) inFlightRef.current = null;
        if (datasetRef.current !== datasetName) return;
        if (schemasDataRef.current !== null) return;
        setData(result.label_schemas);
        setActive(result.active_label_schemas);
      })
      .catch(() => {
        if (inFlightRef.current === datasetName) inFlightRef.current = null;
        // `useOperatorExecutor`'s built-in error toast surfaces the
        // failure to the user; nothing further to do here.
      });

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, datasetName, schemasData]);
};
