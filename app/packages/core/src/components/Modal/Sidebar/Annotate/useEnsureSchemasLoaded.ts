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
import { useEffect } from "react";
import { activeLabelSchemas, labelSchemasData } from "./state";

export const useEnsureSchemasLoaded = (enabled: boolean): void => {
  const schemasData = useAtomValue(labelSchemasData);
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const get = useOperatorExecutor("get_label_schemas");

  // Trigger a fetch only when:
  //   - the caller is enabled (e.g. user can manage schemas),
  //   - the atom is null (nobody else has loaded it),
  //   - the executor isn't already in-flight or done for this mount.
  //
  // We gate on `isExecuting || hasExecuted` (stable booleans) rather than
  // `get.result` because `result` is null during the in-flight window and
  // also because `useOperatorExecutor` returns a new object reference each
  // render — making `get` an unsuitable dependency. Excluding `get` from the
  // deps is intentional.
  useEffect(() => {
    if (!enabled) return;
    if (schemasData !== null) return;
    if (get.isExecuting || get.hasExecuted) return;
    get.execute({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, schemasData]);

  // Mirror operator result → atoms when it lands.
  useEffect(() => {
    if (!get.result) return;
    setData(get.result.label_schemas);
    setActive(get.result.active_label_schemas);
  }, [get.result, setData, setActive]);
};
