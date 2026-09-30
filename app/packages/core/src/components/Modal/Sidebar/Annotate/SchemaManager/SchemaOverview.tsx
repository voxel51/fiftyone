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

import { Code, scrollable, useTheme } from "@fiftyone/components";
import { useOperatorAvailability } from "@fiftyone/operators";
import type { ListItemProps } from "@voxel51/voodo";
import {
  Anchor,
  Button,
  Input,
  Icon,
  IconName,
  Pill,
  RichList,
  Size,
  Spinner,
  ToggleSwitch,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
  Select,
  AddIcon,
  ContentCopyIcon,
  DeleteIcon,
  Dropdown,
  DropdownAnchor,
  EditIcon,
  MenuIconTextItem,
} from "@voxel51/voodo";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addToActiveSchemas,
  currentField,
  fieldAttributeCount,
  fieldType,
  removeFromActiveSchemas,
} from "../state";
import { useSchemaManager } from "../useSchemaManager";
import { isSystemReadOnlyField, TAB_GUI, TAB_IDS, TAB_JSON } from "./constants";
import {
  useActiveFieldsList,
  useFullSchemaEditor,
  useLabelSchemasData,
  useNewFieldMode,
  useSchemaEditorGUIJSONToggle,
  useSelectedActiveFields,
  useSelectedHiddenFields,
  useSelectionCleanup,
} from "./hooks";
import SecondaryText from "./SecondaryText";
import SelectAllCheckbox from "./SelectAllCheckbox";
import { useShiftRangeSelection } from "./useShiftRangeSelection";
import {
  CollapsibleHeader,
  ContentArea,
  GUISectionHeader,
  SelectableList,
} from "./styled";
import {
  docFieldTier,
  loadedSchemaDoc,
  PROTECTED_PATHS,
  selectedSchemaDocId,
  LIST_LABEL_SCHEMA_DOCS_OPERATOR,
  useSchemaDocs,
  withoutFieldTier,
  type SchemaDocContentEntry,
  type SchemaDocSummary,
  type SchemaDocTier,
} from "./useSchemaDocs";

function makeStyles(theme: ReturnType<typeof useTheme>) {
  const onSurface = theme.text.primary;
  const onSurfaceMuted = theme.text.secondary;

  return {
    bar: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    fieldName: {
      fontSize: 13,
      color: onSurface,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
    emptyText: {
      fontSize: 12,
      color: onSurfaceMuted,
      padding: "4px 2px 8px",
    },
    errorText: {
      fontSize: 12,
      color: theme.error.main,
      padding: "2px 2px 6px",
    },
  };
}

interface RowData {
  path: string;
  tier: SchemaDocTier;
  /** Scanned — has a configured label schema (content). */
  setUp: boolean;
  system: boolean;
  unsupported: boolean;
}

const SectionTitle = ({ children }: { children: string }) => (
  <Text
    variant={TextVariant.Lg}
    style={{ fontWeight: 500 }}
    color={TextColor.Secondary}
  >
    {children}
  </Text>
);

const InfoTip = ({ text }: { text: string }) => (
  <Tooltip content={<Text>{text}</Text>} anchor={Anchor.Top} portal>
    <Icon name={IconName.Info} size={Size.Md} />
  </Tooltip>
);

// voodo's Select shows nothing for an empty id; the dataset default
// rides this sentinel and maps back to "no doc".
const DEFAULT_SCHEMA_OPTION = "__default__";

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
  const [naming, setNaming] = useState<null | "create" | "rename" | "delete">(
    null,
  );
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

  const rowPaths = useMemo(() => {
    const paths = new Set<string>(Object.keys(datasetSchemas ?? {}));
    if (docMode && doc) {
      for (const p of Object.keys(doc.label_schema)) paths.add(p);
      for (const p of Object.keys(doc.visibility.fields ?? {})) paths.add(p);
    }
    return [...paths].sort();
  }, [datasetSchemas, doc, docMode]);

  const activeSet = useMemo(() => new Set(activeFields), [activeFields]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const out: RowData[] = [];
    for (const path of rowPaths) {
      if (needle && !path.toLowerCase().includes(needle)) continue;
      const meta = datasetSchemas?.[path] as
        | { label_schema?: unknown; unsupported?: boolean }
        | undefined;
      const system = isSystemReadOnlyField(path);
      const unsupported = Boolean(meta?.unsupported);
      if (docMode && doc) {
        out.push({
          path,
          tier: docFieldTier(doc, path) as SchemaDocTier,
          setUp: path in doc.label_schema,
          system,
          unsupported,
        });
      } else {
        // Dataset default: a scanned field is annotate+explore, an
        // unscanned one explore-only; nothing is ever hidden.
        const setUp = Boolean(meta?.label_schema);
        out.push({
          path,
          tier: setUp ? "annotate" : "explore",
          setUp,
          system,
          unsupported,
        });
      }
    }
    return out;
  }, [rowPaths, search, datasetSchemas, docMode, doc]);

  const sections = useMemo(() => {
    const order = new Map(activeFields.map((p, i) => [p, i]));
    const byStoredOrder = (a: RowData, b: RowData) =>
      (order.get(a.path) ?? 1e9) - (order.get(b.path) ?? 1e9) ||
      a.path.localeCompare(b.path);
    const visible = rows.filter((r) => r.tier !== "hidden");
    // Selectable (hideable) rows first; every un-selectable row — the
    // protected paths that can be set up but never hidden, then system
    // fields — sits together at the bottom of Active.
    const hideable = (r: RowData) =>
      !r.system && !r.unsupported && !PROTECTED_PATHS.has(r.path);
    return {
      scanned: visible
        .filter((r) => r.setUp && hideable(r))
        .sort(byStoredOrder),
      unscanned: visible.filter((r) => !r.setUp && hideable(r)),
      unhideable: visible
        .filter(
          (r) => !r.system && !r.unsupported && PROTECTED_PATHS.has(r.path),
        )
        .sort(byStoredOrder),
      system: visible.filter((r) => r.system || r.unsupported),
      hidden: rows.filter((r) => r.tier === "hidden"),
    };
  }, [rows, activeFields]);

  // Dataset default: "scanned ⇒ annotate" — a set-up field that is
  // still deactivated (a legacy explore-only demotion) is activated so
  // the Annotate sidebar matches what this surface shows.
  const activatedRef = useRef<string>("");
  useEffect(() => {
    if (docMode || search.trim()) return;
    const stale = [...sections.scanned, ...sections.unhideable]
      .filter((r) => r.setUp && !activeSet.has(r.path))
      .map((r) => r.path);
    if (!stale.length) return;
    const key = stale.join(",");
    if (activatedRef.current === key) return;
    activatedRef.current = key;
    const paths = new Set(stale);
    addActive(paths);
    activateSchemas({ fields: stale }).catch(() => {
      removeActive(paths);
      setError(`Failed to activate ${stale.join(", ")}`);
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

  // Batched per-row display metadata (doc-aware via the envelope
  // overlay in `effectiveLabelSchemasData`).
  const rowTypes = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(rowPaths.map((p) => [p, get(fieldType(p))])),
        ),
      [rowPaths],
    ),
  );
  const rowAttrCounts = useAtomValue(
    useMemo(
      () =>
        atom((get) =>
          Object.fromEntries(
            rowPaths.map((p) => [p, get(fieldAttributeCount(p))]),
          ),
        ),
      [rowPaths],
    ),
  );

  // ---- Actions ----

  const persistDoc = (updates: Parameters<typeof api.updateDoc>[1]) => {
    // Guard: never write to a doc that isn't the current selection.
    if (!doc || doc.id !== selectedId) return;
    const previous = doc;
    setDoc({ ...doc, ...updates });
    api.updateDoc(doc.id, updates).catch((err) => {
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
        await api.updateDoc(target, { name });
        if (doc?.id === target) setDoc({ ...doc, name });
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

  const buildItem = useCallback(
    (row: RowData, draggable: boolean) => {
      const type = rowTypes[row.path];
      const attrCount = rowAttrCounts[row.path];
      const actionable = !row.system && !row.unsupported;
      const canOpen = row.setUp && actionable;
      const hidden = row.tier === "hidden";
      // Checkboxes drive the footer's Active ↔ Hidden move; only custom
      // schemas hide, and protected fields can never be hidden.
      const canSelect =
        docMode && actionable && (hidden || !PROTECTED_PATHS.has(row.path));
      return {
        id: row.path,
        data: {
          canSelect,
          canDrag: draggable,
          "data-cy": `field-row-${row.path}`,
          primaryContent: (
            <span style={styles.fieldName} title={row.path}>
              {row.path}
            </span>
          ),
          secondaryContent: (
            <SecondaryText
              fieldType={type ? String(type) : ""}
              attrCount={attrCount}
              isSystemReadOnly={row.system}
            />
          ),
          actions: (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              {row.unsupported ? <Pill size={Size.Md}>Unsupported</Pill> : null}
              {row.system ? <Pill size={Size.Md}>System</Pill> : null}
              {canOpen ? (
                <Tooltip
                  content={<Text>Configure label schema</Text>}
                  anchor={Anchor.Bottom}
                  portal
                >
                  <Button
                    variant={Variant.Icon}
                    borderless
                    data-cy="edit"
                    onClick={() => setCurrentField(row.path)}
                  >
                    <Icon name={IconName.Edit} size={Size.Md} />
                  </Button>
                </Tooltip>
              ) : null}
              {actionable && !hidden && !row.setUp ? (
                <Tooltip
                  content={
                    <Text>Scan the field to set it up for annotation</Text>
                  }
                  anchor={Anchor.Bottom}
                  portal
                >
                  <Button
                    data-cy="scan"
                    size={Size.Sm}
                    variant={Variant.Secondary}
                    onClick={() => setUpField(row)}
                  >
                    Setup
                  </Button>
                </Tooltip>
              ) : null}
            </span>
          ),
        } as ListItemProps,
      };
    },
    [rowTypes, rowAttrCounts, docMode, styles, setCurrentField, setUpField],
  );

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
        {naming === "delete" ? (
          // Deleting is one click away in the menu and has no undo; stages
          // referencing the doc fall back to the default schema.
          <>
            <Text data-cy="schema-delete-confirm">
              Delete schema &ldquo;{doc?.name}&rdquo;? Workflow stages that
              reference it fall back to the default schema.
            </Text>
            <Button
              size={Size.Sm}
              variant={Variant.Danger}
              data-cy="schema-delete-confirm-button"
              onClick={() => deleteSchema()}
            >
              Delete
            </Button>
            <Button
              size={Size.Sm}
              variant={Variant.Secondary}
              onClick={cancelNaming}
            >
              Cancel
            </Button>
          </>
        ) : naming ? (
          <>
            <Input
              size={Size.Sm}
              autoFocus
              data-cy="schema-name-input"
              placeholder={
                naming === "create" ? "New schema name…" : "Rename schema…"
              }
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitName();
                if (e.key === "Escape") cancelNaming();
              }}
              style={{ minWidth: 220 }}
            />
            <Button
              size={Size.Sm}
              variant={Variant.Primary}
              onClick={submitName}
            >
              Save
            </Button>
            <Button
              size={Size.Sm}
              variant={Variant.Secondary}
              onClick={cancelNaming}
            >
              Cancel
            </Button>
          </>
        ) : docsAvailable ? (
          <>
            <Select
              exclusive
              portal
              data-cy="schema-select"
              aria-label="Schema"
              value={selectedId ?? DEFAULT_SCHEMA_OPTION}
              options={[
                {
                  id: DEFAULT_SCHEMA_OPTION,
                  data: { label: "Default schema (all fields)" },
                },
                ...docs.map((d) => ({ id: d.id, data: { label: d.name } })),
              ]}
              onChange={(id) => {
                if (typeof id === "string") {
                  selectSchema(id === DEFAULT_SCHEMA_OPTION ? "" : id);
                }
              }}
              style={{ width: 260 }}
            />
            <Dropdown
              anchor={DropdownAnchor.BottomEnd}
              trigger={
                <Button
                  variant={Variant.Icon}
                  borderless
                  aria-label="Schema actions"
                  data-cy="schema-actions-menu"
                >
                  <Icon name={IconName.MoreHorizontal} size={Size.Md} />
                </Button>
              }
            >
              <MenuIconTextItem
                data-cy="schema-action-new"
                icon={<AddIcon size={Size.Sm} />}
                text="New schema"
                onClick={() => {
                  setNameValue("");
                  setNaming("create");
                }}
              />
              {docMode ? (
                <MenuIconTextItem
                  data-cy="schema-action-rename"
                  icon={<EditIcon size={Size.Sm} />}
                  text="Rename"
                  onClick={() => {
                    setNameValue(doc?.name ?? "");
                    setNaming("rename");
                  }}
                />
              ) : null}
              <MenuIconTextItem
                data-cy="schema-action-duplicate"
                icon={<ContentCopyIcon size={Size.Sm} />}
                text="Duplicate"
                onClick={() => duplicateSchema()}
              />
              {docMode ? (
                <MenuIconTextItem
                  data-cy="schema-action-delete"
                  icon={<DeleteIcon size={Size.Sm} />}
                  text="Delete schema"
                  destructive
                  onClick={() => setNaming("delete")}
                />
              ) : null}
            </Dropdown>
          </>
        ) : null}
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
            <>
              <GUISectionHeader>
                {docMode ? (
                  <SelectAllCheckbox
                    ids={[...scannedItems, ...restItems]
                      .filter((i) => i.data.canSelect)
                      .map((i) => i.id)}
                    selected={selectedActive}
                    onChange={setActiveSelection}
                    label="Select all active fields"
                    data-cy="select-all-active-fields"
                  />
                ) : null}
                <SectionTitle>Active fields</SectionTitle>
                <InfoTip text="Fields available in the Explore and Annotate sidebars. Set-up fields are annotatable; unscanned fields are explore-only until you set them up." />
                <Pill size={Size.Md}>{activeCount}</Pill>
              </GUISectionHeader>
              {activeCount ? (
                <div onMouseDownCapture={activeRange.onMouseDownCapture}>
                  {scannedItems.length ? (
                    <SelectableList>
                      <RichList
                        data-cy="active-fields"
                        listItems={scannedItems}
                        draggable={canReorder}
                        onOrderChange={handleOrderChange}
                        onSelected={onActiveSelected}
                        selected={selectedActiveList}
                      />
                    </SelectableList>
                  ) : null}
                  {restItems.length ? (
                    // Same spacing between the two lists as between
                    // their rows, so the section reads as one list.
                    <SelectableList
                      style={{
                        marginTop: scannedItems.length ? "1rem" : 0,
                      }}
                    >
                      <RichList
                        data-cy="inactive-fields"
                        listItems={restItems}
                        draggable={false}
                        onSelected={onActiveSelected}
                        selected={selectedActiveList}
                      />
                    </SelectableList>
                  ) : null}
                </div>
              ) : (
                <div style={styles.emptyText}>No active fields.</div>
              )}

              <>
                <GUISectionHeader>
                  {docMode ? (
                    <SelectAllCheckbox
                      ids={hiddenItems
                        .filter((i) => i.data.canSelect)
                        .map((i) => i.id)}
                      selected={selectedHidden}
                      onChange={setHiddenSelection}
                      label="Select all hidden fields"
                      data-cy="select-all-hidden-fields"
                    />
                  ) : null}
                  <CollapsibleHeader
                    onClick={() => setHiddenExpanded((v) => !v)}
                    style={{ padding: 0, flex: "none" }}
                    data-cy="schema-group-Hidden"
                  >
                    <SectionTitle>Hidden fields</SectionTitle>
                    <Icon
                      name={
                        hiddenExpanded
                          ? IconName.ChevronTop
                          : IconName.ChevronBottom
                      }
                      size={Size.Md}
                    />
                  </CollapsibleHeader>
                  <InfoTip text="Hidden fields never reach anyone viewing through this schema — not the grid, the sidebars, or the sample data." />
                  <Pill size={Size.Md}>{sections.hidden.length}</Pill>
                </GUISectionHeader>
                {hiddenExpanded ? (
                  hiddenItems.length ? (
                    <SelectableList
                      onMouseDownCapture={hiddenRange.onMouseDownCapture}
                    >
                      <RichList
                        data-cy="hidden-fields"
                        listItems={hiddenItems}
                        draggable={false}
                        onSelected={onHiddenSelected}
                        selected={selectedHiddenList}
                      />
                    </SelectableList>
                  ) : (
                    <div style={styles.emptyText}>
                      {docMode
                        ? "No hidden fields. Select active fields and move them here to hide them in this schema."
                        : "The default schema shows every field. To hide fields, create a custom schema and edit it there."}
                    </div>
                  )
                ) : null}
              </>
            </>
          )}
        </>
      )}
    </div>
  );
};

/**
 * JSON view: the selected DOC's stored shape (label_schema +
 * visibility) in custom-schema mode; the dataset envelope otherwise.
 * Read-only.
 */
const OverviewJSON = () => {
  const { currentJson } = useFullSchemaEditor();
  const managerDoc = useAtomValue(loadedSchemaDoc);
  const docJson = managerDoc
    ? JSON.stringify(
        {
          name: managerDoc.name,
          label_schema: managerDoc.label_schema,
          visibility: managerDoc.visibility,
        },
        null,
        2,
      )
    : null;

  // Explicit height: the Code editor sizes to its container, and an
  // auto-height container collapses it to nothing.
  return (
    <ContentArea className={scrollable} style={{ height: "60vh" }}>
      <Code
        value={docJson ?? currentJson}
        language="json"
        height="100%"
        width="100%"
        readOnly
      />
    </ContentArea>
  );
};

export default SchemaOverview;
