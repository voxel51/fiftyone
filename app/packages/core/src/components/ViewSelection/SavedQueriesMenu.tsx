/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  Anchor,
  BookmarkIcon,
  BookmarkStrokeIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  IconAction,
  IconColor,
  Input,
  MenuSectionTitle,
  MenuSeparator,
  Popover,
  PopoverAnchor,
  SearchIcon,
  Size,
  SlidersHorizontalIcon,
  Text,
  TextAction,
  TextColor,
  TextVariant,
  Tooltip,
  AddIcon,
} from "@voxel51/voodo";
import clsx from "clsx";
import { useEffect, useState } from "react";

import styles from "./SavedQueriesMenu.module.css";
import useSavedQueries, { kindOf, type SavedQuery } from "./useSavedQueries";
import ViewDialog from "./ViewDialog";

/**
 * The view bar's bookmark: the dataset's saved queries — loading one, saving
 * the current query, editing or deleting saved ones. An outline at rest,
 * filled while a saved query is loaded. The save/edit dialog lives outside the menu, so the menu
 * closing does not take the dialog with it.
 */
export default function SavedQueriesMenu({ hidden }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const queries = useSavedQueries(search);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  const run = (action: () => void) => () => {
    changeOpen(false);
    action();
  };

  return (
    <>
      <Popover
        open={open && !hidden}
        onOpenChange={changeOpen}
        anchor={PopoverAnchor.BottomEnd}
        panelClassName={styles.panel}
        trigger={
          <Tooltip
            anchor={Anchor.Bottom}
            content={
              queries.loaded ? `Loaded: ${queries.loaded}` : "Saved queries"
            }
          >
            <IconAction
              icon={queries.loaded ? BookmarkIcon : BookmarkStrokeIcon}
              size={Size.Sm}
              aria-label="Saved queries"
              aria-expanded={open}
              className={clsx(styles.trigger, queries.loaded && styles.loaded)}
              onClick={() => changeOpen(!open)}
              data-cy="view-bar-saved-queries"
            />
          </Tooltip>
        }
      >
        <div data-cy="saved-views-selection-container">
          <div className={styles.head}>
            <MenuSectionTitle>Saved queries</MenuSectionTitle>
            <span
              title={queries.canSave ? undefined : queries.cannotEditReason}
            >
              <TextAction
                size={Size.Sm}
                leadingIcon={AddIcon}
                disabled={!queries.canSave}
                onClick={run(queries.create)}
                data-cy="saved-views-create-new"
              >
                Save query
              </TextAction>
            </span>
          </div>
          {queries.all.length > 0 && (
            <div data-cy="saved-views-selection-search-container">
              <Input
                type="search"
                size={Size.Sm}
                icon={SearchIcon}
                placeholder="Search saved queries"
                aria-label="Search saved queries"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-cy="saved-views-selection-search-input"
              />
            </div>
          )}
          <div
            role="listbox"
            aria-label="Saved queries"
            className={styles.list}
            data-cy="saved-views-selection-view"
          >
            {queries.shown.map((query) => (
              <Row
                key={query.id}
                query={query}
                loaded={query.name === queries.loaded}
                canEdit={queries.canEdit}
                onLoad={run(() => queries.load(query))}
                onEdit={run(() => queries.edit(query))}
              />
            ))}
          </div>
          {!queries.shown.length && (
            <Text
              variant={TextVariant.BodyTertiary}
              color={TextColor.Secondary}
              className={styles.empty}
            >
              {queries.all.length
                ? "No saved queries match"
                : "No saved queries yet"}
            </Text>
          )}
          {queries.loaded && (
            <>
              <MenuSeparator />
              <TextAction
                size={Size.Sm}
                leadingIcon={CloseIcon}
                onClick={run(queries.clear)}
                data-cy="saved-views-btn-selection-clear"
              >
                Clear loaded query
              </TextAction>
            </>
          )}
        </div>
      </Popover>
      <ViewDialog
        id="saved-views"
        canEdit={queries.canEdit}
        savedViews={queries.all}
        onEditSuccess={queries.onEditSuccess}
        onDeleteSuccess={queries.onDeleteSuccess}
      />
    </>
  );
}

const Row = ({
  query,
  loaded,
  canEdit,
  onLoad,
  onEdit,
}: {
  query: SavedQuery;
  loaded: boolean;
  canEdit: boolean;
  onLoad: () => void;
  onEdit: () => void;
}) => {
  const search = kindOf(query) === "search";
  const KindIcon = search ? SearchIcon : SlidersHorizontalIcon;

  return (
    <div
      role="option"
      aria-selected={loaded}
      tabIndex={0}
      className={clsx(styles.row, loaded && styles.current)}
      onClick={onLoad}
      onKeyDown={(event) => {
        if (event.key === "Enter") onLoad();
      }}
      data-cy={`saved-views-${query.slug}-selection-option`}
    >
      <Tooltip
        anchor={Anchor.Bottom}
        content={search ? "Search" : "View stages"}
      >
        <span className={styles.kind}>
          <KindIcon size={14} color={IconColor.Default} />
        </span>
      </Tooltip>
      <Text
        variant={TextVariant.BodySecondary}
        color={TextColor.Primary}
        className={styles.name}
      >
        {query.name}
      </Text>
      {loaded && <CheckIcon size={14} color={IconColor.Default} />}
      {canEdit && (
        <IconAction
          icon={EditIcon}
          size={Size.Sm}
          aria-label={`Edit ${query.name}`}
          className={styles.edit}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          data-cy="btn-edit-selection"
        />
      )}
    </div>
  );
};
