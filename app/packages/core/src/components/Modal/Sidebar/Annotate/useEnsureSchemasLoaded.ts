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
 * This hook is the minimal complement: a one-shot fetch that fills the
 * atoms iff they're currently null. It does NOT close the modal or clear
 * existing data — that responsibility stays with `useLoadSchemas`.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { activeLabelSchemas, labelSchemasData } from "./state";
import {
  operatorAsPromise,
  type ListSchemasRequest,
  type ListSchemasResponse,
  type Operator,
} from "./useSchemaManager";

export const useEnsureSchemasLoaded = (enabled: boolean): void => {
  const schemasData = useAtomValue(labelSchemasData);
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const get = useOperatorExecutor("get_label_schemas") as unknown as Operator<
    ListSchemasRequest,
    ListSchemasResponse
  > & { isExecuting: boolean; hasExecuted: boolean };

  // Mirror the latest atom value into a ref so the in-flight request's
  // resolve callback can re-check synchronously: if another loader (e.g.
  // the modal's `useLoadSchemas`) populated the atoms while we were
  // waiting, we don't want to clobber their data with our stale fetch.
  const schemasDataRef = useRef(schemasData);
  schemasDataRef.current = schemasData;

  // Gate on `isExecuting || hasExecuted` (stable booleans) rather than
  // `get.result` — `useOperatorExecutor` returns a new object reference
  // each render, so excluding `get` from the deps is intentional.
  useEffect(() => {
    if (
      !enabled ||
      schemasData !== null ||
      get.isExecuting ||
      get.hasExecuted
    ) {
      return undefined;
    }

    let cancelled = false;
    operatorAsPromise(get, {})
      .then((result) => {
        if (cancelled) return;
        // Re-check: another loader may have populated the atoms while
        // our request was in flight; preserve their data instead of
        // overwriting it with ours.
        if (schemasDataRef.current !== null) return;
        setData(result.label_schemas);
        setActive(result.active_label_schemas);
      })
      .catch(() => {
        // `useOperatorExecutor`'s built-in error toast surfaces the
        // failure to the user; nothing further to do here.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, schemasData]);
};
