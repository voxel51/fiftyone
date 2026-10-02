/**
 * ``SchemaLensSelector``: the Explore "schema lens" — the grid
 * sidebar's dropdown for viewing the dataset through any of its custom
 * label schemas (EDIT/MANAGE users). The dataset DEFAULT schema is the
 * dataset's own stored schemas: every field visible, nothing hidden —
 * so "Default" simply means no lens.
 *
 * A chosen lens feeds ``activeSchemaExclusions``/``...AttrExclusions``
 * (client filtering + the ``$extendedView`` page-query reload) and
 * yields to an active workflow task (``fos.taskSchemaGoverns``).
 * Hidden entirely inside ANY task and for restricted viewers —
 * labelers reach the grid only through a workflow, whose stage schema
 * governs; they never get to pick a schema, and never call the
 * schema-doc operators (which they may not be permitted to execute).
 * With no custom schemas the dropdown still renders, with a hint, so
 * the feature is discoverable to schema-capable viewers.
 *
 * Renders as a text trigger (layers icon + current schema + chevron)
 * opening a menu of check items — the dataset default first — with a
 * "Manage schema" entry below a separator for schema managers.
 * ``SchemaLensRow`` places it in the sidebar.
 */

import { useOperatorAvailability } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import {
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  LayersIcon,
  MenuCheckItem,
  MenuIconTextItem,
  MenuSeparator,
  MenuTextItem,
  SettingsIcon,
  Size,
  Spinner,
} from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, { useEffect, useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { useSchemaManagerModal } from "../../Modal/Sidebar/Annotate/SchemaManager/hooks";
import {
  schemaManagerDisplayedAtom,
  taskLabelSchemaDoc,
} from "../../Modal/Sidebar/Annotate/state";
import useCanManageSchema from "../../Modal/Sidebar/Annotate/useCanManageSchema";
import {
  LIST_LABEL_SCHEMA_DOCS_OPERATOR,
  useSchemaDocs,
  type SchemaDocSummary,
} from "../../Modal/Sidebar/Annotate/SchemaManager/useSchemaDocs";

export const ALL_FIELDS_LENS = "__all__";

/**
 * A lens option styled like voodo's ``Select`` option (the design): the
 * selected row sits on the ``Selected`` surface with an accent check on
 * the right. voodo's menu check item only offers a leading, plain check
 * and does not export its option component, so the same tokens are
 * applied here (the variables come from voodo's stylesheet).
 */
/**
 * voodo 2.1's Button treats a borderless trigger whose label is not a
 * plain string child as icon-only: square aspect, full rounding and icon
 * padding. This trigger wraps its label (ellipsis span, optional
 * spinner), so it rendered as a 137px square and pushed the sidebar
 * apart. Until voodo counts a wrapped label as text, restore the pill
 * shape here; sized to sit with the sidebar rows.
 */
const LensTrigger = styled(DropdownTrigger)`
  && {
    aspect-ratio: auto;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    min-width: 0;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
`;

const LensItem = styled(MenuCheckItem)`
  flex-direction: row-reverse;
  justify-content: space-between;

  &[aria-checked="true"] {
    background-color: var(--color-content-bg-selected);
  }

  &[aria-checked="true"] svg {
    color: var(--color-brand-primary);
  }
`;

/** Menu label of the dataset default; the trigger shows the short form. */
export const DEFAULT_SCHEMA_LABEL = "Default schema (all fields)";
const DEFAULT_SCHEMA_SHORT_LABEL = "Default schema";

/** The lens value for a resolved schema doc. */
const lensFromDoc = (
  dataset: string,
  docId: string,
  doc: Awaited<ReturnType<ReturnType<typeof useSchemaDocs>["getDoc"]>>,
) => ({
  dataset,
  docId,
  name: doc.name,
  excluded: doc.resolved?.excluded_paths ?? [],
  excludedAttrs: doc.resolved?.excluded_attr_paths ?? [],
  excludedAttrDb: doc.resolved?.excluded_attr_db_paths ?? [],
});

// FiftyOne Teams restricts some roles (Labelers) to task-only browsing;
// OSS has no such role and no such hook. Resolved once at module load so
// the hook identity is stable.
const useRestrictedBrowsing: () => boolean =
  (fos as { useRestrictedDatasetBrowsing?: () => boolean })
    .useRestrictedDatasetBrowsing ?? (() => false);

/**
 * Whether the schema lens applies to the current viewer and surface:
 * a schema-capable viewer on the Samples tab, outside any workflow
 * task (whose stage schema governs instead).
 */
export const useSchemaLensAvailable = () => {
  const datasetName = useRecoilValue(fos.datasetName);
  const canEditLabels = useRecoilValue(fos.canEditLabels);
  const canManageSchema = useRecoilValue(fos.canManageSchema);
  const taskDoc = useAtomValue(taskLabelSchemaDoc);
  const taskGoverns = useRecoilValue(fos.taskSchemaGoverns);
  // Patches views expose labels, not the dataset's fields: no schema row
  // (and no Schema Manager entry) there, matching the Create section.
  const patches = useRecoilValue(fos.isPatchesView);
  // Labelers (and any role an org restricts to task-only browsing).
  const restricted = useRestrictedBrowsing();

  const canSwitch =
    !restricted && Boolean(canEditLabels?.enabled || canManageSchema?.enabled);
  return {
    available:
      Boolean(datasetName) && canSwitch && !patches && !taskDoc && !taskGoverns,
    canSwitch,
    datasetName,
  };
};

const SchemaLensSelector = ({
  maxValueWidth = 150,
}: {
  /** Trigger text wider than this ellipsizes (px). */
  maxValueWidth?: number;
}) => {
  const api = useSchemaDocs();
  const schemaManagerDisplayed = useAtomValue(schemaManagerDisplayedAtom);
  // The schema-doc operators register after the sidebar mounts; listing
  // before that fails (and used to read as "No custom schemas" for good).
  const docsAvailable = useOperatorAvailability(
    LIST_LABEL_SCHEMA_DOCS_OPERATOR,
  );

  const { available, canSwitch, datasetName } = useSchemaLensAvailable();
  const [lens, setLens] = useRecoilState(fos.schemaLens);
  const canManage = useCanManageSchema();
  const { openSchemaManager } = useSchemaManagerModal();

  const [docs, setDocs] = useState<SchemaDocSummary[]>([]);
  const [busy, setBusy] = useState(false);
  // Until the first listing lands (operators registering, dataset
  // schema loading) the menu shows a spinner rather than "no schemas".
  const [loaded, setLoaded] = useState(false);
  // The dataset the current `docs` were listed for.
  const listedDatasetRef = useRef<string | null>(null);
  // The applied lens as of the latest render, for the reconcile below
  // (reading it through a ref keeps the listing effect off its deps).
  const lensRef = useRef(lens);
  lensRef.current = lens;

  useEffect(() => {
    // Only schema-capable viewers list docs: the read operators are
    // permission-gated per user, and a failed resolution must never
    // surface as a sidebar error for a labeler.
    if (!datasetName || !canSwitch || !docsAvailable) {
      return undefined;
    }
    if (listedDatasetRef.current !== datasetName) {
      // A new dataset: the previous rows are not its schemas.
      listedDatasetRef.current = datasetName;
      setDocs([]);
      setLoaded(false);
    }
    let stale = false;
    api
      .listDocs()
      .then((rows) => {
        if (stale) return;
        setDocs(rows);
        // Reconcile an applied lens with the fresh listing: its doc may
        // have been edited or deleted in the Schema Manager meanwhile.
        const applied = lensRef.current;
        if (
          !applied ||
          applied.dataset !== datasetName ||
          applied.docId === ALL_FIELDS_LENS
        ) {
          return;
        }
        if (!rows.some((doc) => doc.id === applied.docId)) {
          setLens(null);
          return;
        }
        api
          .getDoc(applied.docId, true)
          .then((doc) => {
            if (!stale) setLens(lensFromDoc(datasetName, applied.docId, doc));
          })
          .catch(() => undefined);
      })
      .catch(() => {
        if (!stale) setDocs([]);
      })
      .finally(() => {
        if (!stale) setLoaded(true);
      });
    return () => {
      stale = true;
    };
    // Refetch per dataset, once the operators are available, and each
    // time the Schema Manager opens or closes (schemas may have been
    // created, renamed or deleted in it). `api` is memoized and `setLens`
    // is a Recoil setter; both are stable.
  }, [
    api,
    datasetName,
    canSwitch,
    docsAvailable,
    schemaManagerDisplayed,
    setLens,
  ]);

  if (!available || !datasetName) {
    return null;
  }

  const current =
    lens?.dataset === datasetName && lens.docId !== ALL_FIELDS_LENS
      ? lens.docId
      : ALL_FIELDS_LENS;
  const currentLabel =
    current === ALL_FIELDS_LENS
      ? DEFAULT_SCHEMA_SHORT_LABEL
      : (docs.find((doc) => doc.id === current)?.name ?? lens?.name ?? "");

  const select = async (docId: string) => {
    if (!docId || docId === ALL_FIELDS_LENS) {
      // The dataset default: every field, no lens.
      setLens(null);
      return;
    }
    setBusy(true);
    try {
      const doc = await api.getDoc(docId, true);
      setLens(lensFromDoc(datasetName, docId, doc));
    } catch (err) {
      console.error("Failed to apply schema lens:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dropdown
      portal
      anchor={DropdownAnchor.BottomStart}
      disabled={busy}
      trigger={
        <LensTrigger
          borderless
          data-cy="schema-lens-select"
          aria-label="View the dataset through a label schema"
          title={currentLabel}
          leadingIcon={LayersIcon}
          style={{ maxWidth: maxValueWidth + 40, minWidth: 0 }}
        >
          {!loaded || busy ? (
            <span
              role="status"
              aria-label={busy ? "Applying schema" : "Loading schemas"}
              style={{ display: "inline-flex" }}
            >
              <Spinner size={Size.Sm} />
            </span>
          ) : null}
          <span
            style={{
              display: "block",
              maxWidth: maxValueWidth,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentLabel}
          </span>
        </LensTrigger>
      }
    >
      <LensItem
        data-cy="schema-lens-option-default"
        checked={current === ALL_FIELDS_LENS}
        onClick={() => select(ALL_FIELDS_LENS)}
      >
        {DEFAULT_SCHEMA_LABEL}
      </LensItem>
      {docs.map((doc) => (
        <LensItem
          key={doc.id}
          data-cy="schema-lens-option"
          checked={current === doc.id}
          title={doc.name}
          onClick={() => select(doc.id)}
        >
          <span
            style={{
              display: "block",
              maxWidth: 260,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.name}
          </span>
        </LensItem>
      ))}
      {!loaded ? (
        <MenuTextItem disabled data-cy="schema-lens-loading">
          <Spinner size={Size.Sm} /> Loading schemas…
        </MenuTextItem>
      ) : !docs.length ? (
        <MenuTextItem disabled>No custom schemas</MenuTextItem>
      ) : null}
      {canManage ? (
        <>
          <MenuSeparator />
          <MenuIconTextItem
            data-cy="open-schema-manager"
            icon={<SettingsIcon size={Size.Sm} />}
            text="Manage schema"
            onClick={() => openSchemaManager()}
          />
        </>
      ) : null}
    </Dropdown>
  );
};

export default React.memo(SchemaLensSelector);
