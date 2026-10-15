import {
  gridActionDisabledReason,
  useGridSelectionActions,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { getEventBus } from "@fiftyone/events";
import AgentPromotion from "./AgentPromotion";
import { SelectionAssistantFallbackContext } from "./SelectionAssistantFallbackContext";
import OperatorPlacements from "@fiftyone/operators/src/OperatorPlacements";
import { Places } from "@fiftyone/operators/src/types";
import {
  isTextEditingTarget,
  KnownContexts,
  useUndoRedo,
} from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import {
  FOLD_STEP,
  foldWindow,
  MAX_SELECTION_BUCKETS,
  selectionBucketIcon,
  selectionBucketTitle,
  useFoldRevealed,
  useGridSelection,
  useGridSelectionBoundary,
  useInvalidateSelectionScope,
  useSelectionBucketActions,
  useSelectionSections,
  type EpisodeSelection,
  type GridSampleNode,
  type SelectionCounts,
} from "@fiftyone/state/src/selection";
import {
  Button,
  ChevronBottomIcon,
  ChevronTopIcon,
  Divider,
  IconAction,
  MoreHorizontalIcon,
  Orientation,
  RedoIcon,
  Text,
  UndoIcon,
  useDragDelta,
} from "@voxel51/voodo";
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { getHoveredTile } from "../gridTileRegistry";
import BucketColumn from "./BucketColumn";
import { capturedGroupSlice } from "./capturedGroupSlice";
import FoldCard from "./FoldCard";
import { SplitIcon } from "./muiIcons";
import {
  episodeTitle,
  isFullEpisode,
  unitTitle,
  type SelectionKind,
} from "./format";
import SelectionCard from "./SelectionCard";
import SelectionCards from "./SelectionCards";
import SelectionSummary from "./SelectionSummary";
import { SelectionSimilaritySettings } from "./SimilarityAction";
import SubsetJobs from "./SubsetJobs";
import SelectionTooltip from "./SelectionTooltip";
import styles from "./SelectionTray.module.css";
import {
  CARD_HEIGHT,
  MULTIMODAL_CARD_HEIGHT,
  multimodalTrayTheme,
  STRIP_GAP,
  STRIP_MAX_FRACTION,
  STRIP_PADDING_BOTTOM,
  STRIP_PADDING_TOP,
  trayTheme,
} from "./theme";
import UnavailableReferences from "./UnavailableReferences";
import { useRegisterSelectionActions } from "./useRegisterSelectionActions";
import { trayHistoryScope, useTrayHistory } from "./useTrayHistory";

/** Room for a section's header and padding above its cards. */
const COLUMN_HEADER_HEIGHT = 46;
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad)/.test(navigator.platform);
const EMPTY_COUNTS: SelectionCounts = {
  episodes: 0,
  fullEpisodes: 0,
  segments: 0,
  segmentEpisodes: 0,
  unavailable: 0,
};
const NO_CAPTURES: ReadonlyMap<string, EpisodeSelection> = new Map();

/** Pointer and keyboard resizing of the card strip, bounded by the grid pane. */
function useStripResize(root: RefObject<HTMLElement>, cardHeight: number) {
  const minimum = (cardHeight + STRIP_PADDING_TOP + STRIP_PADDING_BOTTOM) * 0.8;
  const rowHeight = cardHeight + STRIP_GAP;
  const [height, setHeight] = useState(minimum);
  const start = useRef(minimum);
  const maximum = () =>
    Math.max(
      minimum,
      Math.floor(
        (root.current?.closest("[data-selection-workspace]")?.clientHeight ??
          root.current?.parentElement?.clientHeight ??
          640) * STRIP_MAX_FRACTION,
      ),
    );
  const clamp = (value: number) =>
    Math.max(minimum, Math.min(maximum(), value));
  const { isDragging, handleProps } = useDragDelta({
    axis: "vertical",
    onDragStart: () => {
      start.current = clamp(height);
    },
    onDelta: (delta) => setHeight(clamp(start.current - delta)),
  });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowUp"
        ? height + rowHeight
        : event.key === "ArrowDown"
          ? height - rowHeight
          : event.key === "Home"
            ? minimum
            : event.key === "End"
              ? maximum()
              : null;
    if (next === null) return;
    event.preventDefault();
    setHeight(clamp(next));
  };
  return {
    height: clamp(height),
    min: minimum,
    max: maximum(),
    dragging: isDragging,
    handleProps,
    onKeyDown,
  };
}

const MENU_ROWS = '[role="menuitem"]:not(:disabled)';

/** Arrow-key movement between the rows of the overflow panel. */
function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target as Element;
  if (
    !event.currentTarget.contains(target) ||
    target.closest("[data-tray-similarity-settings]")
  )
    return;
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
    // Index and result pickers portal above this panel. Their labelled trigger
    // identifies them as part of this overflow panel even outside its DOM tree.
    const isPicker = (target: EventTarget | null) => {
      const menu = (target as Element | null)?.closest?.('[role="menu"]');
      return menu
        ?.getAttribute("aria-labelledby")
        ?.split(" ")
        .some((id) => anchor.current?.contains(document.getElementById(id)));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !isPicker(event.target)
      )
        setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || isPicker(event.target)) return;
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

/** e2e specs wait on the tray settling before they read its cards or counts */
type SelectionTrayE2EEvents = {
  "e2e:selection-tray:settled": {
    cards: number;
    settled: boolean;
    outside: number;
  };
};

/** Typing into a field or working in a dialog keeps the tray's keys inert. */
function keysInert(event: globalThis.KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return (
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    isTextEditingTarget(target) ||
    Boolean(document.querySelector("[role=dialog]"))
  );
}

/**
 * The persistent bottom bar that states the action scope, plus the
 * expandable strip of captured parents. Explicit captures take precedence
 * over current results; both are resolved completely, never by loaded cards.
 *
 * One section is the plain tray. Split, sections stand side by side, and
 * the active one, the first until another is pressed, receives clicks and
 * is what the bar's actions apply to. Sorting needs no activation: with the
 * pointer on a sample, a section's number key puts it there, or takes it
 * back out, and the number of a section not made yet makes it.
 */
export default function SelectionTray({
  locate,
  getPreview,
}: {
  /** Reveals a captured parent; false when it is outside the results. */
  locate?: (episodeId: string, signal?: AbortSignal) => Promise<boolean>;
  /** Reuses loaded grid media when sorting a hovered tile by number key. */
  getPreview?: (sampleId: string) => GridSampleNode | undefined;
}) {
  useRegisterSelectionActions();
  const selection = useGridSelection(getPreview);
  const groupField = fos.useGroupField();
  const [boundary] = useGridSelectionBoundary();
  const invalidate = useInvalidateSelectionScope(selection.datasetId);
  const layout = useSelectionBucketActions(selection.datasetId);
  const sections = useSelectionSections(selection.domainId);
  const history = useUndoRedo(KnownContexts.Default);
  useTrayHistory(
    selection.domainId,
    trayHistoryScope(selection.domainId, boundary),
  );
  const actions = useGridSelectionActions();
  const showAssistantFallback = useContext(SelectionAssistantFallbackContext);
  const setExpandedSample = fos.useSetExpandedSample();
  const setModalState = fos.useSetModalState();
  // The modal owns the keyboard while a sample is open.
  const modalOpen = fos.useNullableModalSampleId() !== null;
  const [collapsed, setCollapsed] = useState(false);
  const root = useRef<HTMLElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const overflowPanel = useOverflowPanel(more);
  const multimodal = selection.mediaType === "multimodal";
  const { unit, buckets, captures, active } = selection;
  const multi = buckets.length > 1;
  const strip = useStripResize(
    root,
    (multimodal ? MULTIMODAL_CARD_HEIGHT : CARD_HEIGHT) +
      (multi ? COLUMN_HEADER_HEIGHT : 0),
  );
  const stripId = useId();
  const menuId = useId();

  const capturesOf = (bucketId: string) =>
    captures.get(bucketId) ?? NO_CAPTURES;
  const captured = [...selection.selected.values()];
  // A split tray acts on its active section even while it is empty, so
  // actions then reach nothing rather than every result.
  const explicit = captured.length > 0 || multi;
  const showStrip = multi || explicit;
  // The single strip folds to its first and last cards; each press on the
  // fold reveals a chunk from both ends. The loader shares this state so it
  // describes only the rendered ends. Sections fold on their own.
  const first = buckets[0];
  const folding = useFoldRevealed(selection.domainId, first.id);
  const fold = foldWindow([...capturesOf(first.id).values()], folding.revealed);
  const reveal = Math.min(fold.hidden, 2 * FOLD_STEP);
  let cards = 0;
  // A card is titled once its details load; a group card carries its label
  let untitled = false;
  // File names repeat across LeRobot-style episodes; fall back to the id then.
  const nameCounts = new Map<string, number>();
  const named = new Set<string>();
  for (const bucket of buckets)
    for (const group of capturesOf(bucket.id).values()) {
      cards += 1;
      if (!group.filepath && !group.unavailable && !group.group)
        untitled = true;
      if (named.has(group.episodeId)) continue;
      named.add(group.episodeId);
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
    ? (selection.selectedCounts ?? EMPTY_COUNTS)
    : (selection.counts ?? EMPTY_COUNTS);
  const loading =
    selection.pendingCaptures ||
    (explicit
      ? !selection.selectedCounts && !selection.capturedError
      : selection.loading);
  const error = explicit ? selection.capturedError : selection.error;
  const actionError = selection.capturedError ?? error;
  const outside =
    explicit && !selection.loading && !selection.error
      ? captured.filter(
          (group) =>
            !group.unavailable &&
            selection.candidates.get(group.episodeId) === null,
        ).length
      : 0;
  const titleAt = (bucketId: string) => {
    const index = buckets.findIndex((bucket) => bucket.id === bucketId);
    return selectionBucketTitle(buckets[index], index);
  };

  const settled = !loading && !untitled;
  // This effect tells e2e specs when the tray has settled: its counts are
  // loaded and every card is titled.
  useEffect(() => {
    getEventBus<SelectionTrayE2EEvents>().dispatch(
      "e2e:selection-tray:settled",
      { cards, settled, outside },
    );
  }, [cards, settled, outside]);

  // The tray card under the pointer, which number keys sort like a tile.
  const hoveredCard = useRef<string | null>(null);
  const toggle = selection.toggle;
  const sectionAt = sections.sectionAt;
  const sectionCount = buckets.length;
  // This effect toggles the strip with Ctrl+` and sorts hovered samples by
  // number key, creating sections as needed.
  useEffect(() => {
    if (modalOpen) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.shiftKey || keysInert(event)) return;
      if (event.ctrlKey) {
        if (event.key === "`" && showStrip && !event.repeat) {
          event.preventDefault();
          setCollapsed((value) => !value);
        }
        return;
      }
      if (event.repeat || !/^[1-9]$/.test(event.key)) return;
      const sampleId = hoveredCard.current ?? getHoveredTile();
      if (!sampleId) return;
      const position = Number(event.key);
      const bucketId = sectionAt(position - 1);
      if (!bucketId) return;
      event.preventDefault();
      event.stopPropagation();
      // New sections show themselves
      if (position > sectionCount) setCollapsed(false);
      void toggle(sampleId, bucketId);
    };
    // A focused grid control may stop bubbling; hover sorting owns these keys
    // before a media viewer or control can handle them.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [modalOpen, sectionAt, sectionCount, showStrip, toggle]);

  const context: GridSelectionActionContext = {
    datasetId: selection.datasetId,
    mediaType: selection.mediaType,
    source: explicit ? "explicit" : "results",
    counts,
    groups: explicit ? captured : [],
    loading,
    error: actionError,
    boundary,
    scopeKey: selection.scopeKey,
    unit,
    conversion: selection.conversion,
    view: selection.request.view,
    preferredGroupSlice: selection.conversion
      ? undefined
      : capturedGroupSlice(captured, groupField, selection.request.slice),
    bucket:
      explicit && (multi || first.name)
        ? { id: active, name: titleAt(active) }
        : undefined,
    resolve: async () =>
      explicit
        ? selection.resolveCaptured()
        : { kind: "snapshot", ...(await selection.snapshot()) },
  };
  const available = actions.filter((action) =>
    action.supports(selection.mediaType),
  );
  const primary = available.filter((action) => action.placement === "primary");
  const overflow = available.filter((action) => action.placement === "more");

  const open = async (group: EpisodeSelection, bucketId: string) => {
    // Open exactly as the grid does: with the sample's group, and a cursor
    // that walks the section's captured cards for the modal's next and previous.
    const cards = [...capturesOf(bucketId).values()];
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
  /**
   * Clear one archetype (whole parents or segments) from the single strip,
   * or everything: split, that folds the sections back into one empty strip.
   */
  const clear = (kind?: SelectionKind) => {
    if (multi || !kind) {
      selection.clearAll();
      sections.mergeAll();
      return;
    }
    for (const group of capturesOf(first.id).values())
      if ((isFullEpisode(group) ? "episode" : "segment") === kind)
        selection.remove(group.episodeId, first.id);
  };
  const split = () => {
    if (multi) sections.add();
    else sections.split();
    setCollapsed(false);
  };
  const removeGroup = (episodeId: string, bucketId: string) => {
    const items = Array.from(
      root.current?.querySelectorAll<HTMLElement>(
        multi
          ? `[data-bucket="${bucketId}"] [data-episode-id]`
          : "[data-episode-id]",
      ) ?? [],
    );
    const index = items.findIndex(
      (item) => item.dataset.episodeId === episodeId,
    );
    const hadFocus = items[index]?.contains(document.activeElement) ?? false;
    const neighbor = items[index + 1] ?? items[index - 1];
    selection.remove(episodeId, bucketId);
    if (!hadFocus) return;
    window.requestAnimationFrame(() => {
      const target =
        neighbor?.querySelector<HTMLElement>("[data-card-remove]") ??
        root.current?.querySelector<HTMLElement>("[data-tray-clear]");
      target?.focus();
    });
  };
  const renderCard = (group: EpisodeSelection, bucketId: string) => (
    <SelectionCard
      key={group.episodeId}
      group={group}
      candidate={selection.candidates.get(group.episodeId)}
      mediaType={selection.mediaType}
      unit={unit}
      title={titleOf(group)}
      open={(target) => open(target, bucketId)}
      locate={locate}
      capture={(candidate, operation) =>
        selection.capture(candidate, operation, bucketId)
      }
      remove={(episodeId) => removeGroup(episodeId, bucketId)}
      dragFrom={multi ? bucketId : undefined}
    />
  );

  const full = buckets.length >= MAX_SELECTION_BUCKETS;
  const splitLabel = !multi
    ? "Create splits and select into multiple sections"
    : full
      ? `Up to ${MAX_SELECTION_BUCKETS} sections`
      : "Add section";
  const shortcut = IS_MAC ? "⌘" : "Ctrl+";

  return (
    <section
      ref={root}
      className={styles.tray}
      aria-label="Selection"
      data-buckets={multi ? buckets.length : undefined}
      style={multimodal ? multimodalTrayTheme : trayTheme}
      onPointerOver={(event) => {
        hoveredCard.current =
          (event.target as HTMLElement).closest<HTMLElement>(
            "[data-episode-id]",
          )?.dataset.episodeId ?? null;
      }}
      onPointerLeave={() => {
        hoveredCard.current = null;
      }}
    >
      <SubsetJobs datasetId={selection.datasetId} />
      {showStrip && (
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
          {multi ? (
            <div
              role="group"
              className={styles.columns}
              aria-label="Selection sections"
            >
              {buckets.map((bucket, index) => (
                <BucketColumn
                  key={bucket.id}
                  bucket={bucket}
                  index={index}
                  domainId={selection.domainId}
                  unit={unit}
                  captured={[...capturesOf(bucket.id).values()]}
                  multimodal={multimodal}
                  active={bucket.id === active}
                  shapesTaken={buckets
                    .filter((other) => other.id !== bucket.id)
                    .map((other) =>
                      selectionBucketIcon(other, buckets.indexOf(other)),
                    )}
                  renderCard={renderCard}
                  onActivate={selection.activate}
                  onUpdate={layout.update}
                  onClear={(id) => selection.clear(id)}
                  onReceive={(episodeId, from, copy) =>
                    sections.move(episodeId, from, bucket.id, copy)
                  }
                  onMergeBack={
                    index > 0
                      ? () =>
                          sections.mergeInto(bucket.id, buckets[index - 1].id)
                      : undefined
                  }
                  onMergeForward={
                    index < buckets.length - 1
                      ? () =>
                          sections.mergeInto(bucket.id, buckets[index + 1].id)
                      : undefined
                  }
                  onRemove={sections.remove}
                />
              ))}
            </div>
          ) : (
            <SelectionCards
              className={styles.cards}
              label={`Selected ${unit.many}`}
              multimodal={multimodal}
            >
              {fold.head.map((group) => renderCard(group, first.id))}
              {fold.hidden > 0 && (
                <FoldCard
                  hidden={fold.hidden}
                  reveal={reveal}
                  unit={unit}
                  onReveal={() => folding.reveal(FOLD_STEP)}
                />
              )}
              {fold.tail.map((group) => renderCard(group, first.id))}
            </SelectionCards>
          )}
        </div>
      )}
      <div className={styles.bar}>
        <div className={styles.history}>
          <SelectionTooltip
            wrapperClassName={styles.tipWrap}
            content={<Text variant="body-tertiary">{splitLabel}</Text>}
          >
            <IconAction
              size="sm"
              icon={SplitIcon}
              aria-label={multi ? "Add section" : splitLabel}
              disabled={full}
              data-tray-add-bucket=""
              onClick={split}
            />
          </SelectionTooltip>
          <SelectionTooltip
            wrapperClassName={styles.tipWrap}
            content={
              <Text variant="body-tertiary">{`Undo (${shortcut}Z)`}</Text>
            }
          >
            <IconAction
              size="sm"
              icon={UndoIcon}
              aria-label="Undo"
              disabled={!history.undoEnabled}
              onClick={() => void history.undo()}
            />
          </SelectionTooltip>
          {history.redoEnabled && (
            <SelectionTooltip
              wrapperClassName={styles.tipWrap}
              content={
                <Text variant="body-tertiary">
                  {`Redo (${IS_MAC ? "⇧⌘" : "Ctrl+Shift+"}Z)`}
                </Text>
              }
            >
              <IconAction
                size="sm"
                icon={RedoIcon}
                aria-label="Redo"
                onClick={() => void history.redo()}
              />
            </SelectionTooltip>
          )}
        </div>
        <SelectionSummary
          explicit={explicit}
          counts={counts}
          total={multi ? selection.membership.size : undefined}
          unit={unit}
          outside={outside}
          loading={loading}
          error={error}
          onRetry={
            !explicit && selection.retryRangeCapture
              ? selection.retryRangeCapture
              : invalidate
          }
          onClear={clear}
        />
        <div className={styles.scope}>
          <UnavailableReferences
            key={selection.scopeKey}
            groups={selection.unavailableGroups}
            total={selection.unavailableTotal}
            loadPage={selection.loadUnavailable}
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
          <OperatorPlacements place={Places.SAMPLES_GRID_SELECTION_ACTIONS} />
          <OperatorPlacements
            place={Places.SAMPLES_GRID_SELECTION_ASSISTANT}
            fallback={showAssistantFallback ? <AgentPromotion /> : null}
          />
          {overflow.length > 0 && (
            <div ref={more} className={styles.more}>
              <Button
                size="sm"
                variant="borderless"
                leadingIcon={MoreHorizontalIcon}
                className={styles.toolbarButton}
                data-tray-action=""
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
                onClickCapture={(event) => {
                  const row = (event.target as Element).closest(
                    '[role="menuitem"]',
                  );
                  if (row && event.currentTarget.contains(row))
                    overflowPanel.setOpen(false);
                }}
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
                {overflowPanel.open && (
                  <SelectionSimilaritySettings
                    onClose={() => overflowPanel.setOpen(false)}
                  />
                )}
              </div>
            </div>
          )}
          {showStrip && (
            <>
              <Divider
                orientation={Orientation.Column}
                className={styles.collapseDivider}
                aria-hidden="true"
              />
              <SelectionTooltip
                wrapperClassName={styles.tipWrap}
                content={
                  <div className={styles.shortcutTooltip} style={trayTheme}>
                    <Text variant="body-tertiary">
                      {`${collapsed ? "Expand" : "Collapse"} selection tray`}
                    </Text>
                    <span className={styles.shortcutKeys}>
                      <kbd className={styles.shortcutKey}>Ctrl</kbd>
                      <Text variant="body-tertiary" color="text-muted">
                        +
                      </Text>
                      <kbd className={styles.shortcutKey}>`</kbd>
                    </span>
                  </div>
                }
              >
                <IconAction
                  size="sm"
                  icon={collapsed ? ChevronTopIcon : ChevronBottomIcon}
                  aria-label={
                    collapsed
                      ? `Show selected ${unit.many}`
                      : `Hide selected ${unit.many}`
                  }
                  aria-expanded={!collapsed}
                  aria-controls={stripId}
                  aria-keyshortcuts="Control+`"
                  onClick={() => setCollapsed((value) => !value)}
                />
              </SelectionTooltip>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
