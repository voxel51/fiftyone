/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The Saved queries menu's content: save the working view as a query, then
 * load, rename, recolor or delete the dataset's saved queries.
 */

import { getEventBus } from "@fiftyone/events";
import * as fos from "@fiftyone/state";
import {
  ArrowBackIcon,
  BookmarkIcon,
  Button,
  Checkbox,
  DeleteOutlineIcon,
  EditIcon,
  ErrorOutlineIcon,
  FormField,
  IconAction,
  InfoOutlinedIcon,
  Input,
  InputType,
  Popover,
  PopoverAnchor,
  Text,
  TextArea,
  TextBadge,
  TextColor,
  Tooltip,
} from "@voxel51/voodo";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Notice } from "../Grid/Selection/Notice";
import { trayTheme } from "../Grid/Selection/theme";
import {
  SEARCH_THRESHOLD,
  capturesAnything,
  capturesMoreThanStages,
  describeDefinition,
  hasEdits,
  leastUsedColor,
  matchesSearch,
  nameProblem,
  type SavedQuery,
} from "./model";
import styles from "./SavedQueries.module.css";
import {
  useCreateSavedQuery,
  useDeleteSavedQuery,
  useEditSavedQuery,
  useLoadSavedQuery,
  useSaveQueryDefinition,
  useSaveQueryScope,
  useSavedQueries,
  useSavedQueryPermissions,
} from "./useSavedQueries";

/** e2e specs wait on the list a refetch, save, or search leaves on screen */
type SavedQueriesE2EEvents = {
  "e2e:saved-queries:listed": { search: string };
};

/** The colors a new query starts in: the palette without its neutral gray. */
const STARTING_COLORS = fos.constants.COLOR_OPTIONS.map(
  (option) => option.color,
).filter((color) => color !== fos.constants.DEFAULT_COLOR);

/**
 * The menu's content: the save form when there is something new to save,
 * then the dataset's saved queries. Editing a query replaces both.
 */
export default function SavedQueriesPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const { queries, loaded } = useSavedQueries();
  const { canEdit, editDisabledReason } = useSavedQueryPermissions();
  const [editing, setEditing] = useState<SavedQuery | null>(null);

  if (editing) {
    return (
      <EditSavedQuery
        query={editing}
        queries={queries}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div
      className={styles.body}
      role="dialog"
      aria-label="Saved queries"
      data-cy="saved-queries-panel"
    >
      {canEdit ? (
        <SaveQueryForm queries={queries} loaded={loaded} />
      ) : (
        <section className={styles.section}>
          <Text variant="body-secondary">Saved queries</Text>
          <Text variant="caption" color="text-secondary">
            {editDisabledReason}
          </Text>
        </section>
      )}
      <SavedQueryList
        queries={queries}
        loaded={loaded}
        canEdit={canEdit}
        onEdit={setEditing}
        onLoaded={onClose}
      />
      <Text
        variant="caption"
        color="text-secondary"
        className={styles.hint}
        data-cy="saved-queries-subset-hint"
      >
        A query saves how to find results, so they can change as data changes.
        To keep specific samples, save them as a subset from the selection tray.
      </Text>
    </div>
  );
}

function SaveQueryForm({
  queries,
  loaded,
}: {
  queries: readonly SavedQuery[];
  loaded: SavedQuery | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Unset until the user picks one, so the starting color follows the list
  const [color, setColor] = useState<string | null>(null);
  const [includeSelection, setIncludeSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    parts,
    selectionSize,
    selectionSections,
    selectionSavable,
    selectionUnit,
  } = useSaveQueryDefinition(includeSelection);
  const scope = useSaveQueryScope();
  const { create, creating } = useCreateSavedQuery();

  const problem = nameProblem(queries, name);
  const empty = !capturesAnything(parts);
  // A loaded query with nothing added on top is already saved
  const duplicate = Boolean(loaded) && !capturesMoreThanStages(parts);
  const canIncludeSelection = selectionSize > 0 && selectionSavable;
  const disabled =
    creating || empty || duplicate || !name.trim() || Boolean(problem);
  const shownColor = color ?? leastUsedColor(queries, STARTING_COLORS);
  const selectionCount = selectionSize.toLocaleString();
  const selectionNoun =
    selectionSize === 1 ? selectionUnit.one : selectionUnit.many;

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    setError(null);
    create(
      { name, description, color: shownColor },
      includeSelection && selectionSavable,
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setColor(null);
          setIncludeSelection(false);
        },
        onError: (cause) => setError(cause.message),
      },
    );
  };

  if (duplicate && !canIncludeSelection) return null;

  if (empty && !canIncludeSelection) {
    return (
      <section className={styles.section} data-cy="saved-queries-nothing">
        <Text variant="body-secondary">Save current query</Text>
        <Text variant="caption" color="text-secondary">
          Nothing to save yet. Add stages or filters to the view first.
        </Text>
      </section>
    );
  }

  return (
    <section className={styles.section} data-cy="saved-queries-save-form">
      <Text variant="body-secondary">Save current query</Text>
      <form className={styles.saveForm} onSubmit={save}>
        <div className={styles.saveRow}>
          <div className={styles.nameField}>
            <Input
              // The menu opens to save: the name is the first thing to type
              autoFocus
              size="md"
              className={styles.nameInput}
              placeholder="Name this query"
              aria-label="Query name"
              value={name}
              error={Boolean(problem)}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              data-cy="saved-queries-name-input"
            />
            <ColorRibbon value={shownColor} onChange={setColor} />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={disabled}
            data-cy="saved-queries-save"
          >
            {creating ? "Saving…" : "Save"}
          </Button>
        </div>
        <Input
          size="md"
          placeholder="Description (optional)"
          aria-label="Query description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          data-cy="saved-queries-description-input"
        />
      </form>
      {problem && (
        <Text
          variant="caption"
          color="text-failure"
          data-cy="saved-queries-name-error"
        >
          {problem}
        </Text>
      )}
      <Text
        variant="caption"
        color="text-secondary"
        data-cy="saved-queries-definition"
      >
        {duplicate
          ? `Same as “${loaded?.name}”. Include the selection to save a new query.`
          : empty
            ? "Nothing to save yet. Add stages or filters, or limit to the selection."
            : describeDefinition(parts)}
      </Text>
      {selectionSize > 0 &&
        (selectionSavable ? (
          <Checkbox
            size="sm"
            checked={includeSelection}
            onChange={setIncludeSelection}
            label={
              selectionSections > 1
                ? `Limit to the ${selectionCount} ${selectionNoun} selected across ${selectionSections} sections`
                : `Limit to the ${selectionCount} selected ${selectionNoun}`
            }
            data-cy="saved-queries-include-selection"
          />
        ) : (
          <Text variant="caption" color="text-secondary">
            The selection isn&apos;t saved: IDs in this view are regenerated
            each time it loads.
          </Text>
        ))}
      {scope && (
        <div data-cy="saved-queries-scope">
          <Notice
            tone="info"
            icon={InfoOutlinedIcon}
            title={
              scope.saved
                ? "Saved within the open subset"
                : "The open subset isn’t saved"
            }
          >
            {scope.saved
              ? "The query keeps referring to this subset and shows its current members. It stops loading if the subset is deleted."
              : "The query saves its stages only. Loading it later runs them on whatever scope is open, such as the full dataset."}
          </Notice>
        </div>
      )}
      {error && (
        <Notice
          tone="error"
          icon={ErrorOutlineIcon}
          title="The query wasn’t saved"
          role="alert"
        >
          {error}
        </Notice>
      )}
    </section>
  );
}

/**
 * The new query's color, as a small ribbon like the bookmark it wears in the
 * list; clicking it opens the palette.
 */
function ColorRibbon({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const label =
    fos.constants.COLOR_OPTIONS.find(
      (option) => option.color.toLowerCase() === value.toLowerCase(),
    )?.label ?? "Custom";
  return (
    <span className={styles.ribbonSlot}>
      <Popover
        anchor={PopoverAnchor.BottomStart}
        trigger={
          <button
            type="button"
            className={styles.ribbon}
            // A data color, not a design token
            style={{ "--swatch": value } as CSSProperties}
            aria-label={`Color: ${label}`}
            title="Pick a color"
            data-cy="saved-queries-color"
          />
        }
      >
        {({ close }) => (
          <div style={trayTheme}>
            <ColorSwatches
              value={value}
              onChange={(color) => {
                onChange(color);
                close();
              }}
            />
          </div>
        )}
      </Popover>
    </span>
  );
}

function SavedQueryList({
  queries,
  loaded,
  canEdit,
  onEdit,
  onLoaded,
}: {
  queries: readonly SavedQuery[];
  loaded: SavedQuery | null;
  canEdit: boolean;
  onEdit: (query: SavedQuery) => void;
  onLoaded: () => void;
}) {
  const [search, setSearch] = useState("");
  const shown = useMemo(
    () => queries.filter((query) => matchesSearch(query, search)),
    [queries, search],
  );

  // This effect tells e2e specs which list is on screen once a refetch,
  // save, delete, or search has settled.
  useEffect(() => {
    getEventBus<SavedQueriesE2EEvents>().dispatch("e2e:saved-queries:listed", {
      search: search.trim().toLowerCase(),
    });
  }, [shown, search]);

  return (
    <section
      className={`${styles.section} ${styles.list}`}
      data-cy="saved-queries-list"
    >
      <div className={styles.listHeader}>
        <Text
          variant="caption"
          color="text-secondary"
          className={styles.eyebrow}
        >
          Saved
        </Text>
        {queries.length > 0 && (
          <TextBadge color="text-secondary">{queries.length}</TextBadge>
        )}
      </div>
      {queries.length > SEARCH_THRESHOLD && (
        <Input
          type={InputType.Search}
          size="sm"
          placeholder="Search saved queries"
          aria-label="Search saved queries"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          data-cy="saved-queries-search"
        />
      )}
      {queries.length === 0 ? (
        <Text
          variant="body-tertiary"
          color="text-secondary"
          data-cy="saved-queries-empty"
        >
          No saved queries yet
        </Text>
      ) : shown.length === 0 ? (
        <Text variant="body-tertiary" color="text-secondary">
          No saved queries match “{search.trim()}”
        </Text>
      ) : (
        <ul className={styles.rows}>
          {shown.map((query) => (
            <SavedQueryRow
              key={query.id}
              query={query}
              loaded={loaded?.id === query.id}
              canEdit={canEdit}
              onEdit={onEdit}
              onLoaded={onLoaded}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SavedQueryRow({
  query,
  loaded,
  canEdit,
  onEdit,
  onLoaded,
}: {
  query: SavedQuery;
  loaded: boolean;
  canEdit: boolean;
  onEdit: (query: SavedQuery) => void;
  onLoaded: () => void;
}) {
  const load = useLoadSavedQuery();
  const { remove, deleting } = useDeleteSavedQuery();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const testId = `saved-query-${query.slug}`;

  if (confirming) {
    return (
      <li className={styles.confirm} data-cy={`${testId}-confirm`}>
        <Text variant="body-tertiary">Delete “{query.name}”?</Text>
        <Text variant="caption" color="text-secondary">
          Subsets saved from its results are kept.
        </Text>
        {error && (
          <Text variant="caption" color="text-failure" role="alert">
            {error}
          </Text>
        )}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={deleting}
            data-cy={`${testId}-confirm-delete`}
            onClick={() =>
              remove(query, { onError: (cause) => setError(cause.message) })
            }
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={styles.row}
      data-cy={testId}
      data-loaded={loaded ? "true" : undefined}
    >
      <button
        type="button"
        className={styles.rowMain}
        aria-current={loaded ? "true" : undefined}
        title={query.description || undefined}
        data-cy={`${testId}-load`}
        onClick={() => {
          if (!loaded) load(query);
          onLoaded();
        }}
      >
        <BookmarkIcon
          size="sm"
          // A query's own color is user data, not a design token
          color={query.color || TextColor.Secondary}
        />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>
            <Text variant="body-tertiary" className={styles.truncate}>
              {query.name}
            </Text>
            {loaded && (
              <Text
                variant="caption"
                color="text-secondary"
                data-cy="saved-query-loaded"
              >
                Loaded
              </Text>
            )}
          </span>
          {query.description && (
            <Text
              variant="caption"
              color="text-secondary"
              className={styles.truncate}
            >
              {query.description}
            </Text>
          )}
        </span>
      </button>
      {canEdit && (
        <span className={styles.rowActions}>
          <Tooltip content="Edit">
            <IconAction
              icon={EditIcon}
              size="sm"
              aria-label={`Edit ${query.name}`}
              data-cy={`${testId}-edit`}
              onClick={() => onEdit(query)}
            />
          </Tooltip>
          <Tooltip content="Delete">
            <IconAction
              icon={DeleteOutlineIcon}
              size="sm"
              aria-label={`Delete ${query.name}`}
              data-cy={`${testId}-delete`}
              onClick={() => setConfirming(true)}
            />
          </Tooltip>
        </span>
      )}
    </li>
  );
}

function EditSavedQuery({
  query,
  queries,
  onDone,
}: {
  query: SavedQuery;
  queries: readonly SavedQuery[];
  onDone: () => void;
}) {
  const [name, setName] = useState(query.name);
  const [description, setDescription] = useState(query.description ?? "");
  const [color, setColor] = useState(query.color ?? "");
  const [error, setError] = useState<string | null>(null);
  const { edit, editing } = useEditSavedQuery();

  const draft = { name, description, color };
  const problem = nameProblem(queries, name, query.slug);
  const disabled =
    editing || !name.trim() || Boolean(problem) || !hasEdits(query, draft);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    setError(null);
    edit(query, draft, {
      onSuccess: onDone,
      onError: (cause) => setError(cause.message),
    });
  };

  return (
    <form
      className={styles.body}
      onSubmit={save}
      aria-label={`Edit ${query.name}`}
      data-cy="saved-query-edit"
    >
      <div className={styles.editHeader}>
        <IconAction
          icon={ArrowBackIcon}
          size="sm"
          aria-label="Back to saved queries"
          onClick={onDone}
        />
        <Text variant="body-secondary">Edit saved query</Text>
      </div>
      <section className={styles.section}>
        <FormField
          label="Name"
          error={problem ?? undefined}
          control={
            <Input
              autoFocus
              size="sm"
              value={name}
              error={Boolean(problem)}
              onChange={(event) => setName(event.target.value)}
              data-cy="saved-query-edit-name"
            />
          }
        />
        <FormField
          label="Description"
          control={
            <TextArea
              size="sm"
              rows={3}
              placeholder="What this query finds"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-cy="saved-query-edit-description"
            />
          }
        />
        <FormField
          label="Color"
          control={<ColorSwatches value={color} onChange={setColor} />}
        />
        <Text variant="caption" color="text-secondary">
          Editing changes the name, description, and color only. To change what
          the query finds, load it, adjust the view, and save it under a new
          name.
        </Text>
        {error && (
          <Notice
            tone="error"
            icon={ErrorOutlineIcon}
            title="Changes weren’t saved"
            role="alert"
          >
            {error}
          </Notice>
        )}
      </section>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled}
          data-cy="saved-query-edit-save"
        >
          {editing ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The saved view palette. A color set from the SDK that is not in it stays
 * available as "Current", so opening the editor never changes it.
 */
function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const palette = fos.constants.COLOR_OPTIONS;
  const custom =
    value &&
    !palette.some(
      (option) => option.color.toLowerCase() === value.toLowerCase(),
    );
  const options = custom
    ? [...palette, { id: "current", label: "Current", color: value }]
    : palette;

  return (
    <div className={styles.swatches} role="radiogroup" aria-label="Color">
      {options.map((option) => {
        const checked = option.color.toLowerCase() === value.toLowerCase();
        return (
          <Tooltip key={option.id} content={option.label}>
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              className={styles.swatch}
              // A data color, not a design token
              style={{ "--swatch": option.color } as CSSProperties}
              data-cy={`saved-query-color-${option.id}`}
              onClick={() => onChange(option.color)}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}
