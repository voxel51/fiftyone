import {
  gridActionDisabledReason,
  useGridSelectionActions,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import AgentPromotion from "./AgentPromotion";
import OperatorPlacements from "@fiftyone/operators/src/OperatorPlacements";
import { Places } from "@fiftyone/operators/src/types";
import * as fos from "@fiftyone/state";
import {
  countSelection,
  FOLD_STEP,
  foldWindow,
  MAX_SELECTION_BUCKETS,
  selectionBucketTitle,
  useFoldRevealed,
  useGridSelection,
  useGridSelectionBoundary,
  useInvalidateSelectionScope,
  useRemoveSelectionBucket,
  useSelectionBucketActions,
  type EpisodeSelection,
  type SelectionBucket,
  type SelectionCounts,
} from "@fiftyone/state/src/selection";
import {
  Anchor,
  Button,
  ChevronBottomIcon,
  ChevronTopIcon,
  Divider,
  MoreHorizontalIcon,
  Orientation,
  Size,
  Text,
  TextVariant,
  Tooltip,
  useDragDelta,
  Variant,
  WorkspacesIcon,
} from "@voxel51/voodo";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import BucketColumn from "./BucketColumn";
import {
  gestureLabel,
  useHeldGesture,
  useTrackHeldGesture,
} from "./bucketGestures";
import FoldCard from "./FoldCard";
import {
  episodeTitle,
  isFullEpisode,
  unitTitle,
  type SelectionKind,
} from "./format";
import SelectionCard from "./SelectionCard";
import SelectionSummary from "./SelectionSummary";
import SubsetJobs from "./SubsetJobs";
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

const UNDO_WINDOW_MS = 5_000;
/** Room for a column header above the cards when buckets sit side by side. */
const COLUMN_HEADER_HEIGHT = 32;
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
  const minimum = cardHeight + STRIP_PADDING_TOP + STRIP_PADDING_BOTTOM;
  const rowHeight = cardHeight + STRIP_GAP;
  const [height, setHeight] = useState(minimum);
  const start = useRef(minimum);
  const maximum = () =>
    Math.max(
      minimum,
      Math.floor(
        (root.current?.parentElement?.clientHeight ?? 640) * STRIP_MAX_FRACTION,
      ),
    );
  const clamp = (value: number) =>
    Math.max(minimum, Math.min(maximum(), value));
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
    height: Math.max(height, minimum),
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

/** What a clear or bucket removal took away, while undo is offered. */
interface Cleared {
  readonly counts?: SelectionCounts;
  readonly groups: readonly EpisodeSelection[];
  readonly bucketId: string;
  /** How many captures the bucket kept, so a fresh selection retires undo. */
  readonly remaining: number;
  /** Present when the whole bucket was removed from the layout. */
  readonly layout?: {
    readonly bucket: SelectionBucket;
    readonly index: number;
  };
}

/**
 * The persistent bottom bar that states the action scope, plus the
 * expandable strip of captured parents. Explicit captures take precedence
 * over current results; both are resolved completely, never by loaded cards.
 *
 * One bucket is the plain tray. Several buckets stand side by side in the
 * strip, each fed by its own gesture, and the bar's actions apply to the one
 * bucket that is the target.
 */
export default function SelectionTray({
  locate,
}: {
  /** Scrolls the grid to a captured parent; false when it is not shown. */
  locate?: (episodeId: string) => Promise<boolean>;
}) {
  useRegisterSelectionActions();
  const selection = useGridSelection();
  const [boundary] = useGridSelectionBoundary();
  const invalidate = useInvalidateSelectionScope(selection.datasetId);
  const layout = useSelectionBucketActions(selection.datasetId);
  const removeBucket = useRemoveSelectionBucket(selection.domainId);
  const actions = useGridSelectionActions();
  const setExpandedSample = fos.useSetExpandedSample();
  const setModalState = fos.useSetModalState();
  const [collapsed, setCollapsed] = useState(false);
  // A clear can be undone until a pause passes or the selection grows past
  // what the clear left behind, so a stale undo can never resurrect old
  // captures over a fresh selection.
  const [cleared, setCleared] = useState<Cleared | null>(null);
  const root = useRef<HTMLElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const overflowPanel = useOverflowPanel(more);
  const multimodal = selection.mediaType === "multimodal";
  const { unit, buckets, captures, target } = selection;
  const multi = buckets.length > 1;
  const strip = useStripResize(
    root,
    (multimodal ? MULTIMODAL_CARD_HEIGHT : CARD_HEIGHT) +
      (multi ? COLUMN_HEADER_HEIGHT : 0),
  );
  const stripId = useId();
  const menuId = useId();
  const held = useHeldGesture();
  useTrackHeldGesture(multi);

  const targetIndex = Math.max(
    0,
    buckets.findIndex((bucket) => bucket.id === target),
  );
  const targetBucket = buckets[targetIndex];
  const capturesOf = (bucketId: string) =>
    captures.get(bucketId) ?? NO_CAPTURES;
  const captured = [...capturesOf(targetBucket.id).values()];
  const explicit = captured.length > 0;
  const anyCaptured = buckets.some((bucket) => capturesOf(bucket.id).size > 0);
  // Long selections fold to their first and last cards; each press on the
  // fold reveals a chunk from both ends. The loader shares this state so it
  // describes only the rendered ends. Columns fold on their own.
  const folding = useFoldRevealed(selection.domainId, targetBucket.id);
  const fold = foldWindow(captured, folding.revealed);
  const folded = fold.hidden > 0;
  const reveal = Math.min(fold.hidden, 2 * FOLD_STEP);
  // File names repeat across LeRobot-style episodes; fall back to the id then.
  const nameCounts = new Map<string, number>();
  const named = new Set<string>();
  for (const bucket of buckets)
    for (const group of capturesOf(bucket.id).values()) {
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
  const armedBucket =
    multi && held === "command"
      ? buckets[1]
      : multi && held === "option"
        ? buckets[2]
        : undefined;
  const bucketName = (bucket: SelectionBucket) =>
    selectionBucketTitle(bucket, buckets.indexOf(bucket));

  // This effect retires the undo affordance after a pause, or as soon as a
  // new selection starts after the clear. It arms only once the clear has
  // landed, since the captures shrink a render after the clear is requested.
  const undoArmed = useRef(false);
  const clearedCount = cleared ? capturesOf(cleared.bucketId).size : 0;
  useEffect(() => {
    if (!cleared) {
      undoArmed.current = false;
      return undefined;
    }
    if (clearedCount <= cleared.remaining) undoArmed.current = true;
    else if (undoArmed.current) {
      setCleared(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setCleared(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [cleared, clearedCount]);

  const context: GridSelectionActionContext = {
    datasetId: selection.datasetId,
    mediaType: selection.mediaType,
    source: explicit ? "explicit" : "results",
    counts,
    groups: explicit ? captured : [],
    loading,
    error: actionError,
    boundary,
    unit,
    conversion: selection.conversion,
    view: selection.request.view,
    preferredGroupSlice: selection.conversion
      ? undefined
      : selection.request.slice,
    bucket:
      explicit && (multi || targetBucket.name)
        ? { id: targetBucket.id, name: bucketName(targetBucket) }
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
    // that walks the bucket's captured cards for the modal's next and previous.
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
  /** Clear one archetype (whole parents or segments), or everything, in one bucket. */
  const clear = (kind?: SelectionKind, bucketId: string = targetBucket.id) => {
    const all = [...capturesOf(bucketId).values()];
    const groups = kind
      ? all.filter(
          (group) => (isFullEpisode(group) ? "episode" : "segment") === kind,
        )
      : all;
    if (!groups.length) return;
    setCleared({
      groups,
      bucketId,
      remaining: all.length - groups.length,
      counts: kind
        ? countSelection(groups)
        : (selection.countsForBucket(bucketId) ?? undefined),
    });
    if (groups.length === all.length) {
      selection.clear(bucketId);
      return;
    }
    for (const group of groups) selection.remove(group.episodeId, bucketId);
  };
  /** Drop a bucket from the layout; its captures come back with undo. */
  const dropBucket = (bucketId: string) => {
    const index = buckets.findIndex((bucket) => bucket.id === bucketId);
    if (index < 0 || buckets.length < 2) return;
    const groups = [...capturesOf(bucketId).values()];
    setCleared({
      groups,
      counts: selection.countsForBucket(bucketId) ?? undefined,
      bucketId,
      remaining: 0,
      layout: { bucket: buckets[index], index },
    });
    removeBucket(bucketId);
  };
  const undoClear = () => {
    if (!cleared) return;
    if (cleared.layout)
      layout.restore(cleared.layout.bucket, cleared.layout.index);
    for (const group of cleared.groups)
      selection.capture(group, "replace", cleared.bucketId);
    setCleared(null);
  };
  const addBucket = () => {
    const id = layout.add();
    if (id) {
      setCollapsed(false);
      selection.setTarget(id);
    }
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
    />
  );

  const showStrip = multi || explicit;
  const clearedFrom =
    cleared && (multi || cleared.layout)
      ? cleared.layout
        ? selectionBucketTitle(cleared.layout.bucket, cleared.layout.index)
        : bucketName(
            buckets.find((bucket) => bucket.id === cleared.bucketId) ??
              targetBucket,
          )
      : undefined;

  return (
    <section
      ref={root}
      className={styles.tray}
      aria-label="Selection"
      data-buckets={multi ? buckets.length : undefined}
      style={multimodal ? multimodalTrayTheme : trayTheme}
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
              aria-label="Selection buckets"
            >
              {buckets.map((bucket, index) => (
                <Fragment key={bucket.id}>
                  {index > 0 && (
                    <Divider
                      orientation={Orientation.Column}
                      className={styles.columnDivider}
                      data-column-divider=""
                    />
                  )}
                  <BucketColumn
                    bucket={bucket}
                    index={index}
                    domainId={selection.domainId}
                    unit={unit}
                    captured={[...capturesOf(bucket.id).values()]}
                    target={bucket.id === targetBucket.id && anyCaptured}
                    armed={armedBucket?.id === bucket.id}
                    removable={buckets.length > 1}
                    renderCard={renderCard}
                    onTarget={selection.setTarget}
                    onUpdate={layout.update}
                    onClear={(id) => clear(undefined, id)}
                    onRemove={dropBucket}
                  />
                </Fragment>
              ))}
            </div>
          ) : (
            <div
              role="group"
              className={styles.cards}
              aria-label={`Selected ${unit.many}`}
            >
              {fold.head.map((group) => renderCard(group, targetBucket.id))}
              {folded && (
                <FoldCard
                  hidden={fold.hidden}
                  reveal={reveal}
                  unit={unit}
                  onReveal={() => folding.reveal(FOLD_STEP)}
                />
              )}
              {fold.tail.map((group) => renderCard(group, targetBucket.id))}
            </div>
          )}
        </div>
      )}
      <div className={styles.bar}>
        {buckets.length < MAX_SELECTION_BUCKETS && (
          <Tooltip
            anchor={Anchor.Top}
            wrapperClassName={styles.tipWrap}
            content={
              <Text variant={TextVariant.Sm}>
                {multi
                  ? `Add a third bucket, fed by ${gestureLabel("option")}`
                  : `Sort into buckets: up to three working selections side by side. Plain clicks fill the first, ${gestureLabel(
                      "command",
                    )} the second, ${gestureLabel("option")} the third.`}
              </Text>
            }
          >
            <Button
              size={Size.Sm}
              variant={Variant.Icon}
              leadingIcon={WorkspacesIcon}
              aria-label={multi ? "Add a bucket" : "Sort into buckets"}
              className={styles.toolbarButton}
              data-tray-add-bucket=""
              onClick={addBucket}
            />
          </Tooltip>
        )}
        <SelectionSummary
          explicit={explicit}
          counts={counts}
          unit={unit}
          outside={outside}
          loading={loading}
          error={error}
          cleared={
            cleared
              ? (cleared.counts ?? countSelection(cleared.groups))
              : undefined
          }
          clearedFrom={clearedFrom}
          onUndo={undoClear}
          onRetry={
            !explicit && selection.retryRangeCapture
              ? selection.retryRangeCapture
              : invalidate
          }
          onClear={clear}
          buckets={
            multi
              ? {
                  items: buckets.map((bucket, index) => ({
                    bucket,
                    index,
                    counts:
                      selection.countsForBucket(bucket.id) ?? EMPTY_COUNTS,
                  })),
                  target: targetBucket.id,
                  onTarget: selection.setTarget,
                  onClear: (bucketId) => clear(undefined, bucketId),
                }
              : undefined
          }
          armed={armedBucket ? bucketName(armedBucket) : null}
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
            fallback={<AgentPromotion />}
          />
          {overflow.length > 0 && (
            <div ref={more} className={styles.more}>
              <Button
                size={Size.Sm}
                variant={Variant.Borderless}
                leadingIcon={MoreHorizontalIcon}
                className={styles.toolbarButton}
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
          {showStrip && (
            <>
              <Divider
                orientation={Orientation.Column}
                className={styles.collapseDivider}
                aria-hidden="true"
              />
              <Button
                size={Size.Sm}
                variant={Variant.Icon}
                className={styles.toolbarButton}
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}
