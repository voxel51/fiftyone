/**
 * Single-mount entry point for the Schema Manager modal at the dataset level.
 *
 * Bundles:
 *   1. `SchemaManagementProvider` — registers operator-backed CRUD.
 *   2. `<SchemaManager />` — rendered when `schemaManagerDisplayedAtom` is on;
 *      portals into the global `#annotation` element.
 *   3. `useSchemaManagerUrl()` — keeps URL ⇄ atom in sync for
 *      `?schemaManager=open`.
 *   4. `useEnsureSchemasLoaded()` — one-shot dataset-level fetch so the modal
 *      renders populated when opened from the grid.
 *
 * Operator-backed schema loading/UI is gated on `canManageSchema` and operator
 * availability. Mount once per app — `DatasetPage.tsx` in OSS, the samples
 * page in teams-app — inside the Recoil/Jotai-aware tree.
 */

import { useRegisterAnnotationContextManager } from "@fiftyone/annotation";
import { useOperatorAvailability } from "@fiftyone/operators";
import { useSchemaManagerUrl } from "../url/useSchemaManagerUrl";
import SchemaManager from "./Modal/Sidebar/Annotate/SchemaManager";
import { useSchemaManagerModal } from "./Modal/Sidebar/Annotate/SchemaManager/hooks";
import SchemaManagementProvider from "./Modal/Sidebar/Annotate/SchemaManagementProvider";
import { useAnnotationContextManager } from "./Modal/Sidebar/Annotate/useAnnotationContextManager";
import useCanManageSchema from "./Modal/Sidebar/Annotate/useCanManageSchema";
import { useEnsureSchemasLoaded } from "./Modal/Sidebar/Annotate/useEnsureSchemasLoaded";

const SchemaManagerOutlet = () => {
  const canManage = useCanManageSchema();
  const operatorAvailable = useOperatorAvailability("get_label_schemas");
  const { schemaManagerDisplayed } = useSchemaManagerModal();
  // Run unconditionally so effect cleanups stay stable across readiness
  // flips. Schema loading remains disabled until its operator is available.
  useSchemaManagerUrl();
  useEnsureSchemasLoaded(canManage && operatorAvailable);
  // The context-manager implementation registers app-level (not gated on
  // `canManage` — enter/exit must work regardless, and programmatic entry
  // via the `annotate` operator can precede the modal mounting).
  useRegisterAnnotationContextManager(useAnnotationContextManager());

  if (!canManage || !operatorAvailable) return null;

  return (
    <>
      <SchemaManagementProvider />
      {schemaManagerDisplayed && <SchemaManager />}
    </>
  );
};

export default SchemaManagerOutlet;
