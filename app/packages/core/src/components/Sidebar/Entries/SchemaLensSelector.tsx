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
 * Renders as a bare inline voodo ``Select`` — ``FilterEntry`` places it
 * in the sidebar's single header row next to the mode dropdown.
 */

import { useOperatorAvailability } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { Anchor, Select, Text, TextColor, Tooltip } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  schemaManagerDisplayedAtom,
  taskLabelSchemaDoc,
} from "../../Modal/Sidebar/Annotate/state";
import {
  LIST_LABEL_SCHEMA_DOCS_OPERATOR,
  useSchemaDocs,
  type SchemaDocSummary,
} from "../../Modal/Sidebar/Annotate/SchemaManager/useSchemaDocs";

export const ALL_FIELDS_LENS = "__all__";

// The empty-state hint row (selecting it never changes the lens).
const NO_SCHEMAS = "__none__";

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
  // Labelers (and any role an org restricts to task-only browsing).
  const restricted = useRestrictedBrowsing();

  const canSwitch =
    !restricted && Boolean(canEditLabels?.enabled || canManageSchema?.enabled);
  return {
    available: Boolean(datasetName) && canSwitch && !taskDoc && !taskGoverns,
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

  const [docs, setDocs] = useState<SchemaDocSummary[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Only schema-capable viewers list docs: the read operators are
    // permission-gated per user, and a failed resolution must never
    // surface as a sidebar error for a labeler.
    if (!datasetName || !canSwitch || !docsAvailable) {
      return undefined;
    }
    let stale = false;
    api
      .listDocs()
      .then((rows) => {
        if (!stale) setDocs(rows);
      })
      .catch(() => {
        if (!stale) setDocs([]);
      });
    return () => {
      stale = true;
    };
    // `api` is referentially stable. Refetch per dataset, once the
    // operators are available, and whenever the Schema Manager closes
    // (schemas may have been created, renamed or deleted in it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetName, canSwitch, docsAvailable, schemaManagerDisplayed]);

  if (!available || !datasetName) {
    return null;
  }

  // voodo's Select shows nothing for an empty id, so the default option
  // carries the ALL_FIELDS_LENS sentinel.
  const current =
    lens?.dataset === datasetName && lens.docId !== ALL_FIELDS_LENS
      ? lens.docId
      : ALL_FIELDS_LENS;

  const select = async (docId: string) => {
    if (!docId || docId === ALL_FIELDS_LENS) {
      // The dataset default: every field, no lens.
      setLens(null);
      return;
    }
    setBusy(true);
    try {
      const doc = await api.getDoc(docId, true);
      setLens({
        dataset: datasetName,
        docId,
        name: doc.name,
        excluded: doc.resolved?.excluded_paths ?? [],
        excludedAttrs: doc.resolved?.excluded_attr_paths ?? [],
        excludedAttrDb: doc.resolved?.excluded_attr_db_paths ?? [],
      });
    } catch (err) {
      console.error("Failed to apply schema lens:", err);
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { id: ALL_FIELDS_LENS, data: { label: "Default schema (all fields)" } },
    ...docs.map((doc) => ({
      id: doc.id,
      data: {
        label: doc.name,
        // Long names ellipsize in the row; the native title shows the rest.
        content: (
          <span
            title={doc.name}
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
        ),
      },
    })),
  ];
  if (!docs.length) {
    options.push({
      id: NO_SCHEMAS,
      data: {
        label: "No custom schemas",
        content: (
          <Tooltip
            anchor={Anchor.Right}
            portal
            content={<Text>Create one in Schema Manager</Text>}
          >
            <Text color={TextColor.Secondary}>No custom schemas</Text>
          </Tooltip>
        ),
      },
    });
  }
  return (
    <Select
      exclusive
      portal
      data-cy="schema-lens-select"
      aria-label="View the dataset through a label schema"
      value={current}
      options={options}
      disabled={busy}
      onChange={(id) => {
        if (typeof id !== "string") return;
        if (id === NO_SCHEMAS) return;
        select(id);
      }}
      style={{ flex: 1, minWidth: 0, maxWidth: maxValueWidth + 40 }}
    />
  );
};

export default React.memo(SchemaLensSelector);
