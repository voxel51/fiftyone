/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The Saved queries menu: a bookmark in the view bar that saves the working
 * view as a named query and lists the dataset's saved queries. Saved queries
 * are saved views under their product name; they share one set of records
 * with the SDK, old links, and workflows.
 */

import {
  Anchor,
  BookmarkIcon,
  Clickable,
  Popover,
  PopoverAnchor,
  Text,
  TextColor,
  Tooltip,
} from "@voxel51/voodo";
import { useEffect, useRef, useState } from "react";
import { trayTheme } from "../Grid/Selection/theme";
import SavedQueriesPanel from "./SavedQueriesPanel";
import styles from "./SavedQueries.module.css";
import { useSavedQueries, useSavedQueryPermissions } from "./useSavedQueries";

/**
 * The view bar's bookmark: shows the loaded query's name and opens the menu
 * that saves and lists the dataset's saved queries.
 */
export default function SavedQueries() {
  const [open, setOpen] = useState(false);
  const { loadedName, refresh } = useSavedQueries();
  const { canEdit, locked } = useSavedQueryPermissions();
  // The list's refetch is rebuilt every render; the shortcut reads the latest
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const toggle = () => {
    if (locked) return;
    // Opening re-reads the list, so queries saved from the SDK show up
    if (!open) refresh();
    setOpen(!open);
  };

  // This effect binds ⌘S / Ctrl+S on the document, the shortcut that opened
  // the old saved view dialog, to open this menu at its name field instead
  // of the browser's save dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.code !== "KeyS") return;
      if (locked || !canEdit) return;
      event.preventDefault();
      refreshRef.current();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [locked, canEdit, setOpen]);

  const label = locked
    ? "Saved queries are locked while working in a task"
    : loadedName
      ? `Saved query: ${loadedName}`
      : "Saved queries";

  const trigger = (
    <Tooltip
      anchor={Anchor.Bottom}
      content={label}
      wrapperClassName={styles.fill}
    >
      <Clickable
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-label="Saved queries"
        aria-expanded={open}
        aria-disabled={locked || undefined}
        data-cy="saved-queries-toggle"
        data-loaded={loadedName ? "true" : undefined}
        className={styles.trigger}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <BookmarkIcon
          size={16}
          color={loadedName ? TextColor.Accent : TextColor.Secondary}
        />
        {loadedName && (
          <Text
            variant="body-tertiary"
            color="text-primary"
            className={styles.triggerName}
            data-cy="saved-queries-loaded-name"
          >
            {loadedName}
          </Text>
        )}
      </Clickable>
    </Tooltip>
  );

  return (
    <Popover
      className={styles.anchor}
      trigger={trigger}
      open={open && !locked}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
      anchor={PopoverAnchor.BottomEnd}
      panelClassName={styles.panel}
      // The panel places focus itself: on the name field when saving is
      // allowed, on the list otherwise
      focusOnOpen={false}
    >
      {({ close }) => (
        <div style={trayTheme}>
          <SavedQueriesPanel onClose={close} />
        </div>
      )}
    </Popover>
  );
}
