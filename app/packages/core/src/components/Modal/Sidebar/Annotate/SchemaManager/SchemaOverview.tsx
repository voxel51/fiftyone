/**
 * ``SchemaOverview``: the Schema Manager surface — ONE layout for the
 * dataset default and every custom schema.
 *
 * Header: [schema dropdown][… actions] … [GUI|JSON][+ New field].
 * Actions: custom schema → New schema / Rename / Duplicate / Delete
 * schema; dataset default → New schema / Duplicate. Below: a search
 * bar (filters rows only), then TWO sections:
 *
 * - **Active fields** — every field annotators and explorers see. Set-up
 *   (scanned) fields first, in the stored order that drives the Annotate
 *   sidebar (drag to reorder in the default schema); unscanned fields
 *   next (explore-only until "Setup" scans them — once scanned a field
 *   is annotate+explore, there is no way back); then, grouped at the
 *   bottom, the rows that can never be hidden: protected paths such as
 *   filepath/tags (annotatable via Setup, but un-hideable) and system
 *   fields (ids/timestamps — never annotatable either).
 * - **Hidden fields** — genuinely hidden: gone from the grid, sidebar,
 *   and sample payloads for anyone viewing through this schema. Only
 *   custom schemas can hide; the dataset default shows every field.
 *
 * In a custom schema, rows carry checkboxes and the modal footer moves
 * the selection between Active and Hidden (the classic interaction,
 * now meaning visibility). Changes persist immediately to the doc
 * (stale-selection guarded).
 */

import { useTheme } from "@fiftyone/components";
import { useOperatorAvailability } from "@fiftyone/operators";
import type { ListItemProps } from "@voxel51/voodo";
import {
  Button,
  Input,
  Size,
  Spinner,
  ToggleSwitch,
  Variant,
} from "@voxel51/voodo";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addToActiveSchemas,
  currentField,
  removeFromActiveSchemas,
} from "../state";
import { useSchemaManager } from "../useSchemaManager";
import { TAB_GUI, TAB_IDS, TAB_JSON } from "./constants";
import FieldSections from "./FieldSections";
import {
  useActiveFieldsList,
  useLabelSchemasData,
  useNewFieldMode,
  useSchemaEditorGUIJSONToggle,
  useSelectedActiveFields,
  useSelectedHiddenFields,
  useSelectionCleanup,
} from "./hooks";
import OverviewJSON from "./OverviewJSON";
import {
  useDatasetFieldTypes,
  useOverviewRows,
  type RowData,
} from "./overviewRows";
import { makeStyles } from "./overviewStyles";
import SchemaPickerBar, { type NamingMode } from "./SchemaPickerBar";
import { useFieldRowItem } from "./useFieldRowItem";
import {
  loadedSchemaDoc,
  selectedSchemaDocId,
  LIST_LABEL_SCHEMA_DOCS_OPERATOR,
  useProtectedPaths,
  useSchemaDocs,
  withoutFieldTier,
  type SchemaDocContentEntry,
  type SchemaDocSummary,
} from "./useSchemaDocs";
import UndeclaredAttributesNotice from "./UndeclaredAttributesNotice";
import { useShiftRangeSelection } from "./useShiftRangeSelection";

const SchemaOverview = () => {
  useSelectionCleanup();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const api = useSchemaDocs();
  const { activateSchemas, setActiveSchemas } = useSchemaManager();

  const [selectedId, setSelectedId] = useAtom(selectedSchemaDocId);
  const [doc, setDoc] = useAtom(loadedSchemaDoc);
  const setCurrentField = useSetAtom(currentField);
  const addActive = useSetAtom(addToActiveSchemas);
  const removeActive = useSetAtom(removeFromActiveSchemas);
  const { setIsNewField } = useNewFieldMode();
  const { tab, setTab } = useSchemaEditorGUIJSONToggle();
  const datasetSchemas = useLabelSchemasData();
  const datasetFields = useDatasetFieldTypes();
  const protectedPaths = useProtectedPaths();
  const { fields: activeFields, setFields: setActiveFieldsOrder } =
    useActiveFieldsList();

  const { selected: selectedActive, setSelected: setSelectedActive } =
    useSelectedActiveFields();
  const { selected: selectedHidden, setSelected: setSelectedHidden } =
    useSelectedHiddenFields();
  // The schema-doc operators may still be registering when the modal
  // opens (it mounts on request); list once they are available.
  const docsAvailable = useOperatorAvailability(
    LIST_LABEL_SCHEMA_DOCS_OPERATOR,
  );

  const [docs, setDocs] = useState<SchemaDocSummary[]>([]);
  const [search, setSearch] = useState("");
  const [hiddenExpanded, setHiddenExpanded] = useState(true);
  const [naming, setNaming] = useState<NamingMode>(null);
  const [nameValue, setNameValue] = useState("");
  // The doc a rename targets — set explicitly after Duplicate, since the
  // duplicate's body may still be loading when the user submits.
  const [renameId, setRenameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  // The selection as of the latest render, for async callbacks.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const refreshDocs = () =>
    api
      .listDocs()
      .then(setDocs)
      .catch((err) => setError(String(err)));

  useEffect(() => {
    if (docsAvailable) refreshDocs();
    // `refreshDocs` is recreated every render (it closes over the stable
    // api and setters only); this effect must run once when the
    // operators become available, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsAvailable]);

  useEffect(() => {
    if (!docsAvailable) return;
    setError(null);
    // Selection changed: drop the previous doc IMMEDIATELY — rendering
    // (or persisting to) a stale doc under a new selection is how
    // schemas once appeared to share settings.
    setDoc(null);
    // Bump the sequence even when nothing is selected, so a getDoc still
    // in flight for the previous selection is discarded on arrival.
    const seq = ++loadSeq.current;
    if (!selectedId) {
      return;
    }
    api
      .getDoc(selectedId)
      .then((loaded) => {
        if (loadSeq.current === seq) setDoc(loaded);
      })
      .catch((err) => {
        if (loadSeq.current === seq) {
          setDoc(null);
          setError(String(err));
        }
      });
    // `api`/`setDoc` are stable; keyed on the selection only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, docsAvailable]);

  const docMode = Boolean(selectedId && doc);

  // ---- Rows ----

  const { sections, activeSet, rowTypes, rowAttrCounts } = useOverviewRows({
    datasetSchemas: datasetSchemas as Record<string, unknown> | null,
    datasetFields,
    protectedPaths,
    doc,
    docMode,
    search,
    activeFields,
  });

  // Dataset default: "scanned ⇒ annotate" — a set-up field that is
  // still deactivated (a legacy explore-only demotion) is activated so
  // the Annotate sidebar matches what this surface shows.
  // Each field is tried once per mount: a failed activation (or the field
  // editor activating the same field) must not retrigger it, which once
  // flooded the server with activation requests.
  const attemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (docMode || search.trim()) return;
    const stale = [...sections.scanned, ...sections.unhideable]
      .filter(
        (r) =>
          r.setUp &&
          !activeSet.has(r.path) &&
          !attemptedRef.current.has(r.path),
      )
      .map((r) => r.path);
    if (!stale.length) return;
    for (const path of stale) attemptedRef.current.add(path);
    const paths = new Set(stale);
    addActive(paths);
    activateSchemas({ fields: stale }).catch((err) => {
      removeActive(paths);
      const names = stale.map((p) => `"${p}"`).join(", ");
      setError(
        `Failed to activate ${stale.length === 1 ? "field" : "fields"} ${names}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }, [
    docMode,
    search,
    sections.scanned,
    sections.unhideable,
    activeSet,
    addActive,
    removeActive,
    activateSchemas,
  ]);

  // ---- Actions ----

  const persistDoc = (updates: Parameters<typeof api.updateDoc>[1]) => {
    // Guard: never write to a doc that isn't the current selection.
    if (!doc || doc.id !== selectedId) return;
    const previous = doc;
    setDoc({ ...doc, ...updates });
    api
      .updateDoc(doc.id, { ...updates, version: previous.version })
      .then((saved) => {
        // Adopt the saved doc (its new version keeps later saves
        // conditional) while it is still the selection.
        if (selectedIdRef.current === saved.id) setDoc(saved);
      })
      .catch((err) => {
        setError(String(err));
        // Roll the optimistic update back, but only while this doc is
        // still the selection: a newer selection owns the atom by then.
        if (selectedIdRef.current === previous.id) setDoc(previous);
      });
  };

  // "Setup" = the original setup flow: open the field editor. In a
  // custom schema, first seed the doc's content entry so the editor
  // authors THIS schema (one-time copy; never a sync).
  const setUpField = (row: RowData) => {
    if (docMode && doc) {
      if (!(row.path in doc.label_schema)) {
        const meta = datasetSchemas?.[row.path] as unknown as
          | {
              label_schema?: SchemaDocContentEntry;
              default_label_schema?: SchemaDocContentEntry;
              type?: string | null;
            }
          | undefined;
        const seed = meta?.label_schema ?? meta?.default_label_schema;
        const entry: SchemaDocContentEntry = seed
          ? { ...seed }
          : meta?.type
            ? { type: meta.type, classes: [], attributes: [] }
            : { type: "detections", classes: [], attributes: [] };
        persistDoc({
          label_schema: { ...doc.label_schema, [row.path]: entry },
          visibility: withoutFieldTier(doc.visibility, row.path),
        });
      }
    }
    setCurrentField(row.path);
  };

  // ---- Schema CRUD ----

  const selectSchema = (id: string) => {
    setNaming(null);
    setSelectedId(id || null);
  };

  const cancelNaming = () => {
    setNaming(null);
    setRenameId(null);
    setNameValue("");
  };

  const submitName = async () => {
    const name = nameValue.trim();
    if (!name) return;
    setError(null);
    try {
      if (naming === "create") {
        const created = await api.createDoc(name, true);
        await refreshDocs();
        setSelectedId(created.id);
      } else if (naming === "rename") {
        const target = renameId ?? doc?.id;
        if (!target) return;
        // Adopt the saved doc: a rename bumps its version, and the next
        // save must send the new one
        const saved = await api.updateDoc(target, { name });
        if (selectedIdRef.current === saved.id) setDoc(saved);
        await refreshDocs();
      }
      setNaming(null);
      setRenameId(null);
      setNameValue("");
    } catch (err) {
      setError(String(err));
    }
  };

  // Duplicate lands the user in Rename on the copy, its name selected.
  const duplicateSchema = async () => {
    setError(null);
    try {
      let created: { id: string; name: string };
      if (docMode && doc) {
        created = await api.createDoc(`${doc.name} copy`, false);
        await api.updateDoc(created.id, {
          label_schema: doc.label_schema,
          visibility: doc.visibility,
        });
      } else {
        created = await api.createDoc("Default schema copy", true);
      }
      await refreshDocs();
      setSelectedId(created.id);
      setRenameId(created.id);
      setNameValue(created.name);
      setNaming("rename");
    } catch (err) {
      setError(String(err));
    }
  };

  const deleteSchema = async () => {
    if (!doc) return;
    setError(null);
    try {
      await api.deleteDoc(doc.id);
      await refreshDocs();
      setSelectedId(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setNaming(null);
    }
  };

  // ---- Render ----

  const buildItem = useFieldRowItem({
    rowTypes,
    rowAttrCounts,
    docMode,
    styles,
    setCurrentField,
    setUpField,
  });

  // Drag-reorder of set-up fields (dataset default, unfiltered view):
  // the stored order drives the Annotate sidebar.
  const canReorder = !docMode && !search.trim();
  const handleOrderChange = (items: { id: string; data: ListItemProps }[]) => {
    const newOrder = items.map((item) => item.id);
    setActiveFieldsOrder(newOrder);
    setActiveSchemas({ fields: newOrder }).catch((err: unknown) =>
      setError(String(err)),
    );
  };

  const setActiveSelection = (ids: string[]) => {
    setSelectedActive(new Set(ids));
    setSelectedHidden(new Set());
  };
  const setHiddenSelection = (ids: string[]) => {
    setSelectedHidden(new Set(ids));
    setSelectedActive(new Set());
  };
  const selectedActiveList = [...selectedActive];
  const selectedHiddenList = [...selectedHidden];

  // Fields arrive after the modal mounts; an empty list before then
  // would read as "this dataset has no fields".
  // The default-schema rows need only the dataset schema; a selected
  // doc additionally waits for its body. Operator availability gates
  // the schema picker, not the field list.
  const loading = datasetSchemas === null || Boolean(selectedId && !doc);

  const activeCount =
    sections.scanned.length +
    sections.unscanned.length +
    sections.unhideable.length +
    sections.system.length;
  const scannedItems = sections.scanned.map((r) => buildItem(r, canReorder));
  const restItems = [
    ...sections.unscanned,
    ...sections.unhideable,
    ...sections.system,
  ].map((r) => buildItem(r, false));
  const hiddenItems = sections.hidden.map((r) => buildItem(r, false));

  // Shift-click selects a range across the Active lists (they share one
  // selection) and within Hidden.
  const activeIds = [...scannedItems, ...restItems]
    .filter((i) => i.data.canSelect)
    .map((i) => i.id);
  const hiddenIds = hiddenItems
    .filter((i) => i.data.canSelect)
    .map((i) => i.id);
  const activeRange = useShiftRangeSelection(
    activeIds,
    setActiveSelection,
    "field-row-",
  );
  const hiddenRange = useShiftRangeSelection(
    hiddenIds,
    setHiddenSelection,
    "field-row-",
  );
  const onActiveSelected = activeRange.onSelected;
  const onHiddenSelected = hiddenRange.onSelected;

  return (
    <div>
      <div style={styles.bar}>
        <SchemaPickerBar
          naming={naming}
          nameValue={nameValue}
          docName={doc?.name}
          docMode={docMode}
          docsAvailable={docsAvailable}
          docs={docs}
          selectedId={selectedId}
          setNameValue={setNameValue}
          setNaming={setNaming}
          submitName={submitName}
          cancelNaming={cancelNaming}
          selectSchema={selectSchema}
          duplicateSchema={duplicateSchema}
          deleteSchema={deleteSchema}
        />
        <div style={{ flex: 1 }} />
        <ToggleSwitch
          size={Size.Md}
          aria-label="View as"
          index={TAB_IDS.indexOf(tab)}
          onChange={(index: number) => setTab(TAB_IDS[index])}
          tabs={[
            { id: TAB_GUI, data: { label: "GUI", content: null } },
            { id: TAB_JSON, data: { label: "JSON", content: null } },
          ]}
        />
        <Button
          size={Size.Md}
          variant={Variant.Primary}
          onClick={() => setIsNewField(true)}
        >
          + New field
        </Button>
      </div>

      {error ? <div style={styles.errorText}>{error}</div> : null}

      {docsAvailable && !(selectedId && !doc) ? (
        <UndeclaredAttributesNotice
          schemaId={docMode ? selectedId : null}
          contentVersion={docMode ? doc?.version : datasetSchemas}
        />
      ) : null}

      {tab === TAB_JSON ? (
        <OverviewJSON />
      ) : (
        <>
          <Input
            size={Size.Sm}
            placeholder="Search fields"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-cy="schema-search"
            style={{ width: "100%", marginBottom: 12 }}
          />
          {loading ? (
            <div
              data-cy="schema-overview-loading"
              role="status"
              aria-label="Loading fields"
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "2rem 0",
              }}
            >
              <Spinner size={Size.Lg} />
            </div>
          ) : (
            <FieldSections
              docMode={docMode}
              styles={styles}
              scannedItems={scannedItems}
              restItems={restItems}
              hiddenItems={hiddenItems}
              activeCount={activeCount}
              hiddenCount={sections.hidden.length}
              canReorder={canReorder}
              handleOrderChange={handleOrderChange}
              selectedActive={selectedActive}
              selectedHidden={selectedHidden}
              selectedActiveList={selectedActiveList}
              selectedHiddenList={selectedHiddenList}
              setActiveSelection={setActiveSelection}
              setHiddenSelection={setHiddenSelection}
              onActiveSelected={onActiveSelected}
              onHiddenSelected={onHiddenSelected}
              activeRange={activeRange}
              hiddenRange={hiddenRange}
              hiddenExpanded={hiddenExpanded}
              setHiddenExpanded={setHiddenExpanded}
            />
          )}
        </>
      )}
    </div>
  );
};

export default SchemaOverview;
