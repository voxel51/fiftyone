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
 * All gated on `canManageSchema`. Mount once per app — `DatasetPage.tsx` in
 * OSS, the samples page in teams-app — inside the Recoil/Jotai-aware tree.
 */

import { useSchemaManagerUrl } from "../url/useSchemaManagerUrl";
import SchemaManager from "./Modal/Sidebar/Annotate/SchemaManager";
import { useSchemaManagerModal } from "./Modal/Sidebar/Annotate/SchemaManager/hooks";
import SchemaManagementProvider from "./Modal/Sidebar/Annotate/SchemaManagementProvider";
import useCanManageSchema from "./Modal/Sidebar/Annotate/useCanManageSchema";
import { useEnsureSchemasLoaded } from "./Modal/Sidebar/Annotate/useEnsureSchemasLoaded";

const SchemaManagerOutlet = () => {
  const canManage = useCanManageSchema();
  const { schemaManagerDisplayed } = useSchemaManagerModal();
  // Run unconditionally so effect cleanups stay stable across permission
  // flips; both hooks are no-ops when `canManage` is false.
  useSchemaManagerUrl();
  useEnsureSchemasLoaded(canManage);

  if (!canManage) return null;

  return (
    <>
      <SchemaManagementProvider />
      {schemaManagerDisplayed && <SchemaManager />}
    </>
  );
};

export default SchemaManagerOutlet;
