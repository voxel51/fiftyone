import {
  gridActionDisabledReason,
  useGridSelectionActions,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import * as fos from "@fiftyone/state";
import {
  countSelection,
  useGridSelection,
  useGridSelectionBoundary,
  useInvalidateSelectionScope,
  type EpisodeSelection,
  type SelectionCounts,
} from "@fiftyone/state/src/selection";
import {
  Button,
  ChevronBottomIcon,
  ChevronTopIcon,
  MoreHorizontalIcon,
  Size,
  Variant,
  useDragDelta,
} from "@voxel51/voodo";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { episodeTitle, unitTitle } from "./format";
import ScopeControls from "./ScopeControls";
import SelectionCard from "./SelectionCard";
import SelectionSummary from "./SelectionSummary";
import styles from "./SelectionTray.module.css";
import {
  STRIP_MAX_FRACTION,
  STRIP_MIN_HEIGHT,
  STRIP_ROW_HEIGHT,
  trayTheme,
} from "./theme";
import UnavailableReferences from "./UnavailableReferences";
import { useRegisterSelectionActions } from "./useRegisterSelectionActions";

const UNDO_WINDOW_MS = 10_000;
const EMPTY_COUNTS: SelectionCounts = {
  episodes: 0,
  fullEpisodes: 0,
  segments: 0,
  segmentEpisodes: 0,
  unavailable: 0,
};

/** Pointer and keyboard resizing of the card strip, bounded by the grid pane. */
function useStripResize(root: RefObject<HTMLElement>) {
  const [height, setHeight] = useState(STRIP_MIN_HEIGHT);
  const start = useRef(STRIP_MIN_HEIGHT);
  const maximum = () =>
    Math.max(
      STRIP_MIN_HEIGHT,
      Math.floor(
        (root.current?.parentElement?.clientHeight ?? 640) * STRIP_MAX_FRACTION,
      ),
    );
  const clamp = (value: number) =>
    Math.max(STRIP_MIN_HEIGHT, Math.min(maximum(), value));
  const { isDragging, handleProps } = useDragDelta({
    axis: "vertical",
    onDragStart: () => {
      start.current = height;
    },
    onDelta: (delta) => setHeight(clamp(start.current - delta)),
  });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowUp"
        ? height + STRIP_ROW_HEIGHT
        : event.key === "ArrowDown"
          ? height - STRIP_ROW_HEIGHT
          : event.key === "Home"
            ? STRIP_MIN_HEIGHT
            : event.key === "End"
              ? maximum()
              : null;
    if (next === null) return;
    event.preventDefault();
    setHeight(clamp(next));
  };
  return {
    height,
    min: STRIP_MIN_HEIGHT,
    max: maximum(),
    dragging: isDragging,
    handleProps,
    onKeyDown,
  };
}

const MENU_ROWS = '[role="menuitem"]:not(:disabled)';

/** Arrow-key movement between the rows of the overflow panel. */
function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>) {
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(MENU_ROWS),
  );
  if (!rows.length) return;
  const current = rows.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "ArrowDown"
      ? (current + 1) % rows.length
      : event.key === "ArrowUp"
        ? (current - 1 + rows.length) % rows.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? rows.length - 1
            : -1;
  if (next < 0) return;
  event.preventDefault();
  rows[next].focus();
}

/**
 * The overflow panel is tray-owned rather than a VOODO Dropdown: its actions
 * must stay mounted while it is closed so the dialogs they open survive, and
 * menu components unmount their content on close.
 */
function useOverflowPanel(anchor: RefObject<HTMLElement>) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // This effect closes the panel on Escape or on a press outside it, and
  // moves focus onto the first row when it opens.
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>(MENU_ROWS)?.focus(),
    );
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      anchor.current?.querySelector<HTMLElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, anchor]);
  return { open, setOpen, panel };
}

/**
 * The persistent bottom bar that states the action scope, plus the
 * expandable strip of captured parents. Explicit captures take precedence
 * over current results; both are resolved completely, never by loaded cards.
 */
export default function SelectionTray() {
  useRegisterSelectionActions();
  const selection = useGridSelection();
  const [boundary] = useGridSelectionBoundary();
  const invalidate = useInvalidateSelectionScope(selection.datasetId);
  const actions = useGridSelectionActions();
  const setExpandedSample = fos.useSetExpandedSample();
  const setModalState = fos.useSetModalState();
  const [providerError, setProviderError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [cleared, setCleared] = useState<readonly EpisodeSelection[] | null>(
    null,
  );
  const root = useRef<HTMLElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const overflowPanel = useOverflowPanel(more);
  const strip = useStripResize(root);
  const stripId = useId();
  const menuId = useId();
  const { unit } = selection;

  const captured = [...selection.selected.values()];
  const explicit = captured.length > 0;
  // File names repeat across LeRobot-style episodes; fall back to the id then.
  const nameCounts = new Map<string, number>();
  for (const group of captured) {
    const name = episodeTitle(group, unit);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const titleOf = (group: EpisodeSelection) => {
    const name = episodeTitle(group, unit);
    return group.filepath && (nameCounts.get(name) ?? 0) === 1
      ? name
      : `${unitTitle(unit)} …${group.episodeId.slice(-6)}`;
  };
  const counts = explicit
    ? countSelection(captured)
    : (selection.counts ?? EMPTY_COUNTS);
  const outside =
    explicit && !selection.loading && !selection.error
      ? captured.filter(
          (group) =>
            !group.unavailable &&
            selection.candidates.get(group.episodeId) === null,
        ).length
      : 0;

  // This effect retires the undo affordance after a pause, or as soon as a
  // new selection starts after the clear, so a stale undo can never
  // resurrect old captures over a fresh selection.
  const undoArmed = useRef(false);
  useEffect(() => {
    if (!cleared) {
      undoArmed.current = false;
      return undefined;
    }
    if (!explicit) undoArmed.current = true;
    else if (undoArmed.current) {
      setCleared(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setCleared(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [cleared, explicit]);

  const context: GridSelectionActionContext = {
    datasetId: selection.datasetId,
    mediaType: selection.mediaType,
    source: explicit ? "explicit" : "results",
    counts,
    groups: explicit ? captured : [],
    loading: !explicit && selection.loading,
    error: !explicit ? selection.error : null,
    boundary,
    unit,
    conversion: selection.conversion,
    view: selection.request.view,
    resolve: async () =>
      explicit
        ? {
            kind: "members",
            members: captured.flatMap((group) => group.members),
          }
        : { kind: "snapshot", ...(await selection.snapshot()) },
  };
  const available = actions.filter((action) =>
    action.supports(selection.mediaType),
  );
  const primary = available.filter((action) => action.placement === "primary");
  const overflow = available.filter((action) => action.placement === "more");

  const open = async (group: EpisodeSelection) => {
    // Open exactly as the grid does: with the sample's group, and a cursor
    // that walks the captured cards for the modal's next and previous.
    const cards = captured;
    let position = Math.max(
      0,
      cards.findIndex((card) => card.episodeId === group.episodeId),
    );
    const locate = (index: number) => ({
      id: cards[index].episodeId,
      groupId: cards[index].groupId,
      hasNext: index < cards.length - 1,
      hasPrevious: index > 0,
    });
    await setModalState({
      next: async (offset = 1) => {
        position = Math.min(cards.length - 1, position + offset);
        return locate(position);
      },
      previous: async (offset = 1) => {
        position = Math.max(0, position - offset);
        return locate(position);
      },
      peek: async () => null,
    });
    await setExpandedSample(locate(position));
  };
  const clearAll = () => {
    setCleared(captured);
    selection.clear();
  };
  const undoClear = () => {
    cleared?.forEach((group) => selection.capture(group));
    setCleared(null);
  };
  const removeGroup = (episodeId: string) => {
    const items = Array.from(
      cards.current?.querySelectorAll<HTMLElement>("[data-episode-id]") ?? [],
    );
    const index = items.findIndex(
      (item) => item.dataset.episodeId === episodeId,
    );
    const hadFocus = items[index]?.contains(document.activeElement) ?? false;
    const neighbor = items[index + 1] ?? items[index - 1];
    selection.remove(episodeId);
    if (!hadFocus) return;
    window.requestAnimationFrame(() => {
      const target =
        neighbor?.querySelector<HTMLElement>("[data-card-remove]") ??
        root.current?.querySelector<HTMLElement>("[data-tray-clear]");
      target?.focus();
    });
  };

  return (
    <section
      ref={root}
      className={styles.tray}
      aria-label="Selection"
      style={trayTheme}
    >
      {explicit && (
        <div
          id={stripId}
          className={styles.strip}
          style={{ height: collapsed ? 0 : strip.height }}
          data-dragging={strip.dragging || undefined}
          aria-hidden={collapsed || undefined}
        >
          <div
            role="separator"
            tabIndex={collapsed ? -1 : 0}
            aria-label="Resize selection tray"
            aria-orientation="horizontal"
            aria-valuemin={strip.min}
            aria-valuemax={strip.max}
            aria-valuenow={strip.height}
            className={styles.handle}
            onKeyDown={strip.onKeyDown}
            {...strip.handleProps}
          >
            <span className={styles.grip} />
          </div>
          <div
            ref={cards}
            role="group"
            className={styles.cards}
            aria-label={`Selected ${unit.many}`}
          >
            {captured.map((group) => (
              <SelectionCard
                key={group.episodeId}
                group={group}
                candidate={selection.candidates.get(group.episodeId)}
                mediaType={selection.mediaType}
                unit={unit}
                title={titleOf(group)}
                open={open}
                capture={selection.capture}
                remove={removeGroup}
              />
            ))}
          </div>
        </div>
      )}
      <div className={styles.bar}>
        <SelectionSummary
          explicit={explicit}
          counts={counts}
          unit={unit}
          outside={outside}
          loading={selection.loading}
          error={selection.error ?? providerError}
          cleared={cleared?.length}
          onUndo={undoClear}
          onRetry={() => {
            setProviderError(null);
            invalidate();
          }}
          onClear={clearAll}
        />
        <div className={styles.scope}>
          <ScopeControls
            datasetId={selection.datasetId}
            mediaType={selection.mediaType}
            unit={unit}
            conversion={selection.conversion}
            onProviderError={setProviderError}
          />
          <UnavailableReferences
            groups={selection.unavailableGroups}
            selected={selection.selected}
            capture={selection.capture}
            unit={unit}
          />
        </div>
        <div className={styles.actions}>
          {primary.map((action) => (
            <action.Component
              key={`${selection.datasetId}:${action.id}`}
              context={context}
              disabledReason={gridActionDisabledReason(action, context)}
              surface="toolbar"
            />
          ))}
          {overflow.length > 0 && (
            <div ref={more} className={styles.more}>
              <Button
                size={Size.Sm}
                variant={Variant.Secondary}
                leadingIcon={MoreHorizontalIcon}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={overflowPanel.open}
                aria-controls={menuId}
                onClick={() => overflowPanel.setOpen((value) => !value)}
              />
              <div
                id={menuId}
                ref={overflowPanel.panel}
                role="menu"
                aria-label="More actions"
                className={styles.menu}
                hidden={!overflowPanel.open}
                onClickCapture={() => overflowPanel.setOpen(false)}
                onKeyDown={moveMenuFocus}
              >
                {overflow.map((action) => (
                  <action.Component
                    key={`${selection.datasetId}:${action.id}`}
                    context={context}
                    disabledReason={gridActionDisabledReason(action, context)}
                    surface="menu"
                  />
                ))}
              </div>
            </div>
          )}
          {explicit && (
            <Button
              size={Size.Sm}
              variant={Variant.Icon}
              leadingIcon={collapsed ? ChevronTopIcon : ChevronBottomIcon}
              aria-label={
                collapsed
                  ? `Show selected ${unit.many}`
                  : `Hide selected ${unit.many}`
              }
              aria-expanded={!collapsed}
              aria-controls={stripId}
              onClick={() => setCollapsed((value) => !value)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
