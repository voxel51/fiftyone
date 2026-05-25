/**
 * Single-mount entry point for the Schema Manager modal at the dataset level.
 *
 * Bundles the three pieces a consuming app needs to make the modal openable
 * from the grid (via the existing sidebar entry points OR via the
 * `?schemaManager=open` URL contract):
 *
 *   1. `SchemaManagementProvider` — registers operator-backed CRUD into the
 *      shared atom (required for mutations to land).
 *   2. The `<SchemaManager />` modal — rendered conditionally on
 *      `schemaManagerDisplayedAtom`. Portals into the global `#annotation`
 *      element.
 *   3. `useSchemaManagerUrl()` — keeps URL ⇄ atom in sync.
 *
 * All three are gated on `canManageSchema`. Mount once per app —
 * `DatasetPage.tsx` in OSS, the samples page in teams-app — inside the
 * Recoil/Jotai-aware tree (e.g. inside `datasetQueryContext.Provider`).
 *
 * Mirrors the structure of `TaskBanner` from `feat/nav_to_task`: one named
 * export from `@fiftyone/core`, one mount line per consuming app, zero
 * router-package imports.
 */

import { canManageSchema } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { useSchemaManagerUrl } from "../url/useSchemaManagerUrl";
import SchemaManager from "./Modal/Sidebar/Annotate/SchemaManager";
import { useSchemaManagerModal } from "./Modal/Sidebar/Annotate/SchemaManager/hooks";
import SchemaManagementProvider from "./Modal/Sidebar/Annotate/SchemaManagementProvider";
import { useEnsureSchemasLoaded } from "./Modal/Sidebar/Annotate/useEnsureSchemasLoaded";

const SchemaManagerOutlet = () => {
  const { enabled: canManage } = useRecoilValue(canManageSchema);
  const { schemaManagerDisplayed } = useSchemaManagerModal();
  // Always run the URL sync hook so its effect cleanups stay stable across
  // permission flips. The sync is harmless when `canManage` is false — the
  // modal just won't render.
  useSchemaManagerUrl();
  // Lazy-fetch label schemas at the dataset level so the modal renders
  // populated when opened from the grid (no sample modal mounted, so
  // Sidebar's `useLoadSchemas` never runs). No-op if schemas are already
  // loaded by Sidebar.
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
