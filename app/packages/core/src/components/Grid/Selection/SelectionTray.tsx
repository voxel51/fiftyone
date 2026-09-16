import {
  gridActionDisabledReason,
  useGridSelectionActions,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import * as fos from "@fiftyone/state";
import {
  countSelection,
  resolveSelection,
  useGridSelection,
  useGridSelectionBoundary,
  useInvalidateSelectionScope,
  type EpisodeSelection,
} from "@fiftyone/state/src/selection";
import {
  Button,
  ChevronBottomIcon,
  ChevronTopIcon,
  MoreHorizontalIcon,
  Popover,
  PopoverAnchor,
  Size,
  Variant,
  useDragDelta,
} from "@voxel51/voodo";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { episodeTitle } from "./format";
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

/**
 * The persistent bottom bar that states the action scope, plus the
 * expandable strip of captured episodes. Explicit captures take precedence
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuHost, setMenuHost] = useState<HTMLDivElement | null>(null);
  const root = useRef<HTMLElement>(null);
  const strip = useStripResize(root);
  const stripId = useId();

  const captured = [...selection.selected.values()];
  const explicit = captured.length > 0;
  // File names repeat across LeRobot-style episodes; fall back to the id then.
  const nameCounts = new Map<string, number>();
  for (const group of captured) {
    const name = episodeTitle(group);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const titleOf = (group: EpisodeSelection) => {
    const name = episodeTitle(group);
    return group.filepath && (nameCounts.get(name) ?? 0) === 1
      ? name
      : `Episode …${group.episodeId.slice(-6)}`;
  };
  const effective = explicit ? captured : selection.groups;
  const counts = countSelection(effective);
  const outside =
    explicit && !selection.loading && !selection.error
      ? captured.filter(
          (group) =>
            !group.unavailable && !selection.candidates.has(group.episodeId),
        ).length
      : 0;

  const context: GridSelectionActionContext = {
    datasetId: selection.datasetId,
    mediaType: selection.mediaType,
    source: explicit ? "explicit" : "results",
    counts,
    groups: effective,
    loading: !explicit && selection.loading,
    error: !explicit ? selection.error : null,
    boundary,
    resolve: async () =>
      explicit
        ? captured.flatMap((group) => group.members)
        : (
            await resolveSelection(selection.datasetId, selection.request)
          ).groups.flatMap((group) => group.members),
  };
  const available = actions.filter((action) =>
    action.supports(selection.mediaType),
  );
  const primary = available.filter((action) => action.placement === "primary");
  const overflow = available.filter((action) => action.placement === "more");

  const open = async (group: EpisodeSelection) => {
    await setModalState();
    await setExpandedSample({
      id: group.episodeId,
      hasNext: false,
      hasPrevious: false,
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
          <div className={styles.cards} aria-label="Selected episodes">
            {captured.map((group) => (
              <SelectionCard
                key={group.episodeId}
                group={group}
                candidate={selection.candidates.get(group.episodeId)}
                title={titleOf(group)}
                open={open}
                loading={selection.loading}
                error={selection.error}
                capture={selection.capture}
                remove={selection.remove}
              />
            ))}
          </div>
        </div>
      )}
      <div className={styles.bar}>
        <div className={styles.scope}>
          <ScopeControls
            datasetId={selection.datasetId}
            mediaType={selection.mediaType}
            onProviderError={setProviderError}
          />
          <UnavailableReferences
            groups={selection.unavailableGroups}
            selected={selection.selected}
            capture={selection.capture}
          />
        </div>
        <SelectionSummary
          explicit={explicit}
          counts={counts}
          outside={outside}
          loading={selection.loading}
          error={selection.error ?? providerError}
          onRetry={() => {
            setProviderError(null);
            invalidate();
          }}
          onClear={selection.clear}
        />
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
            <Popover
              open={moreOpen}
              onOpenChange={setMoreOpen}
              anchor={PopoverAnchor.TopEnd}
              trigger={
                <Button
                  size={Size.Sm}
                  variant={Variant.Secondary}
                  leadingIcon={MoreHorizontalIcon}
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((value) => !value)}
                />
              }
            >
              <div
                ref={setMenuHost}
                role="menu"
                aria-label="More actions"
                className={styles.menu}
                style={trayTheme}
                onClickCapture={() => setMoreOpen(false)}
              />
            </Popover>
          )}
          {overflow.map((action) => (
            <action.Component
              key={`${selection.datasetId}:${action.id}`}
              context={context}
              disabledReason={gridActionDisabledReason(action, context)}
              surface="menu"
              menuHost={moreOpen ? menuHost : null}
            />
          ))}
          {explicit && (
            <Button
              size={Size.Sm}
              variant={Variant.Icon}
              leadingIcon={collapsed ? ChevronTopIcon : ChevronBottomIcon}
              aria-label={
                collapsed ? "Show selected episodes" : "Hide selected episodes"
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
