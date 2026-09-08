/**
 * URL ⇄ atom sync for the Schema Manager modal.
 *
 * URL contract: `?schemaManager=open` ⇄ `schemaManagerDisplayedAtom`.
 *
 * Router-agnostic — reads/writes via the shared `useUrlSearch` /
 * `writeUrlSearch` primitives, which work in both OSS and teams without
 * importing any router package.
 *
 * Headless: call from a function component (e.g. inside `SchemaManagerOutlet`).
 */

import { useEffect, useRef } from "react";
import { useSchemaManagerModal } from "../components/Modal/Sidebar/Annotate/SchemaManager/hooks";
import { useUrlSearch, writeUrlSearch } from "./useUrlSearchSubscription";

export const SCHEMA_MANAGER_QUERY_PARAM = "schemaManager";
export const SCHEMA_MANAGER_QUERY_VALUE = "open";

const isOpenInSearch = (search: string): boolean =>
  new URLSearchParams(search).get(SCHEMA_MANAGER_QUERY_PARAM) ===
  SCHEMA_MANAGER_QUERY_VALUE;

export const useSchemaManagerUrl = (): void => {
  const search = useUrlSearch();
  const { schemaManagerDisplayed, openSchemaManager, closeSchemaManager } =
    useSchemaManagerModal();

  // Skip the first atom→URL pass. On mount the atom defaults to `false` but
  // the URL may already have `?schemaManager=open` — without the skip we'd
  // race URL→atom (which opens the modal) by clearing the URL based on the
  // stale `false`. After the first render, the atom is the source of truth.
  const atomToUrlSkipRef = useRef(true);

  // URL → atom. Fires on mount and any URL change (including SPA navs
  // through either router and browser back/forward).
  useEffect(() => {
    const wantOpen = isOpenInSearch(search);
    if (wantOpen && !schemaManagerDisplayed) {
      openSchemaManager();
    } else if (!wantOpen && schemaManagerDisplayed) {
      closeSchemaManager();
    }
    // We intentionally only react to URL changes here; atom→URL is handled
    // in the next effect. Including the atom in deps would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // atom → URL. Reads current location directly (not the subscribed `search`)
  // to avoid an extra render cycle when both effects fire in the same tick.
  useEffect(() => {
    if (atomToUrlSkipRef.current) {
      atomToUrlSkipRef.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const inUrl =
      params.get(SCHEMA_MANAGER_QUERY_PARAM) === SCHEMA_MANAGER_QUERY_VALUE;
    if (schemaManagerDisplayed && !inUrl) {
      params.set(SCHEMA_MANAGER_QUERY_PARAM, SCHEMA_MANAGER_QUERY_VALUE);
      writeUrlSearch(params.toString());
    } else if (!schemaManagerDisplayed && inUrl) {
      params.delete(SCHEMA_MANAGER_QUERY_PARAM);
      writeUrlSearch(params.toString());
    }
  }, [schemaManagerDisplayed]);
};
