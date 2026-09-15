import {
  gridActionDisabledReason,
  useGridSelectionActions,
  useGridSegmentProviders,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import * as fos from "@fiftyone/state";
import {
  countSelection,
  getSelectionProviders,
  resolveSelection,
  selectionScopeLabel,
  useGridSelection,
  useGridSelectionBoundary,
  type EpisodeSelection,
} from "@fiftyone/state/src/selection";
import {
  Button,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  Size,
  Text,
  TextVariant,
  Variant,
  cssVar,
} from "@voxel51/voodo";
import { useEffect, useRef, useState } from "react";
import SelectionCard from "./SelectionCard";
import styles from "./SelectionTray.module.css";

/** Persistent scope summary, grouped captures, and contributed actions. */
export default function SelectionTray() {
  const selection = useGridSelection();
  const [boundary, setBoundary] = useGridSelectionBoundary();
  const clearTemporalTags = fos.useClearTemporalTagConstraint();
  const actions = useGridSelectionActions();
  const providers = useGridSegmentProviders();
  const [options, setOptions] = useState<{
    eventFields: string[];
    temporalTags: string[];
  }>({ eventFields: [], temporalTags: [] });
  const [providerError, setProviderError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(150);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number; maximum: number } | null>(
    null,
  );
  const controller = useRef<AbortController>();
  const setExpandedSample = fos.useSetExpandedSample();
  const setModalState = fos.useSetModalState();
  const captured = [...selection.selected.values()];
  const explicit = captured.length > 0;
  const effective = explicit ? captured : selection.groups;
  const counts = countSelection(effective);

  // This effect loads source choices and cancels provider work on dataset changes.
  useEffect(() => {
    let active = true;
    setProviderError(null);
    setOptions({ eventFields: [], temporalTags: [] });
    getSelectionProviders(selection.datasetId)
      .then((value) => {
        if (active) setOptions(value);
      })
      .catch((error: unknown) => {
        if (active) setProviderError(String(error));
      });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, [selection.datasetId]);

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
  const overflow = available.filter((action) => action.placement === "more");
  const providerLabel =
    boundary.provider?.kind === "events"
      ? `Events · ${boundary.provider.field}`
      : boundary.provider?.kind === "temporal-tags"
        ? `Temporal tags${boundary.provider.values.length ? ` · ${boundary.provider.values.join(", ")}` : ""}`
        : boundary.provider?.kind === "ranges"
          ? boundary.provider.label
          : null;

  const chooseProvider = (provider: typeof boundary.provider) => {
    controller.current?.abort();
    setProviderError(null);
    setBoundary({ ...boundary, provider });
  };

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
      aria-label="Episode selection"
      style={{
        background: cssVar.color.bg.card[1],
        color: cssVar.color.text.fg,
        borderTop: `1px solid ${cssVar.color.border.default}`,
      }}
    >
      {explicit && !collapsed && (
        <>
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize selection tray"
            aria-orientation="horizontal"
            aria-valuemin={80}
            aria-valuemax={Math.max(
              80,
              Math.floor(
                (root.current?.parentElement?.clientHeight ?? 500) * 0.4,
              ),
            )}
            aria-valuenow={height}
            className={styles.resize}
            onKeyDown={(event) => {
              if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                setHeight((current) =>
                  Math.max(
                    80,
                    Math.min(
                      (root.current?.parentElement?.clientHeight ?? 500) * 0.4,
                      current + (event.key === "ArrowUp" ? 20 : -20),
                    ),
                  ),
                );
              }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                y: event.clientY,
                height,
                maximum:
                  (root.current?.parentElement?.clientHeight ?? 500) * 0.4,
              };
            }}
            onPointerMove={(event) => {
              if (drag.current)
                setHeight(
                  Math.max(
                    80,
                    Math.min(
                      drag.current.maximum,
                      drag.current.height + drag.current.y - event.clientY,
                    ),
                  ),
                );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <div
            className={styles.cards}
            style={{
              height,
              gap: cssVar.spacing.sm,
              padding: cssVar.spacing.sm,
            }}
          >
            {captured.map((group) => (
              <SelectionCard
                key={group.episodeId}
                group={group}
                candidate={selection.candidates.get(group.episodeId)}
                open={open}
                loading={selection.loading}
                error={selection.error}
                capture={selection.capture}
                remove={selection.remove}
              />
            ))}
          </div>
        </>
      )}
      <div
        className={styles.toolbar}
        style={{ gap: cssVar.spacing.sm, padding: cssVar.spacing.sm }}
      >
        <div className={styles.summary} aria-live="polite">
          <Text variant={TextVariant.Md}>
            {explicit
              ? `${counts.episodes} episode${counts.episodes === 1 ? "" : "s"} selected: ${selectionScopeLabel(counts)}`
              : selection.loading
                ? "Resolving all current results…"
                : `All current results: ${selectionScopeLabel(counts)}`}
          </Text>
          <Dropdown
            anchor={DropdownAnchor.TopStart}
            trigger={
              <DropdownTrigger size={Size.Xs}>
                {providerLabel
                  ? `Matching segments · ${providerLabel}`
                  : "Whole episodes"}
              </DropdownTrigger>
            }
          >
            <MenuTextItem
              onClick={() => {
                controller.current?.abort();
                clearTemporalTags();
                chooseProvider(undefined);
              }}
            >
              Whole episodes
            </MenuTextItem>
            {options.eventFields.map((field) => (
              <MenuTextItem
                key={field}
                onClick={() =>
                  chooseProvider({ kind: "events", field, values: [] })
                }
              >
                Events · {field}
              </MenuTextItem>
            ))}
            {options.temporalTags.map((tag) => (
              <MenuTextItem
                key={tag}
                onClick={() =>
                  chooseProvider({ kind: "temporal-tags", values: [tag] })
                }
              >
                Temporal tags · {tag}
              </MenuTextItem>
            ))}
            {providers
              .filter((provider) => provider.supports(selection.mediaType))
              .map((provider) => (
                <MenuTextItem
                  key={provider.id}
                  onClick={async () => {
                    controller.current?.abort();
                    const pending = new AbortController();
                    controller.current = pending;
                    setProviderError(null);
                    try {
                      const members = await provider.resolve(
                        selection.datasetId,
                        pending.signal,
                      );
                      if (!pending.signal.aborted)
                        setBoundary({
                          ...boundary,
                          provider: {
                            kind: "ranges",
                            label: provider.label,
                            members,
                          },
                        });
                    } catch (error) {
                      if (!pending.signal.aborted)
                        setProviderError(String(error));
                    }
                  }}
                >
                  {provider.label}
                </MenuTextItem>
              ))}
          </Dropdown>
        </div>
        {explicit && (
          <Button
            size={Size.Sm}
            variant={Variant.Borderless}
            onClick={selection.clear}
          >
            Clear selection
          </Button>
        )}
        {available
          .filter((action) => action.placement === "primary")
          .map(({ Component, ...action }) => (
            <Component
              key={action.id}
              context={context}
              disabledReason={gridActionDisabledReason(
                { ...action, Component },
                context,
              )}
            />
          ))}
        {overflow.length > 0 && (
          <Dropdown
            anchor={DropdownAnchor.TopEnd}
            trigger={<DropdownTrigger>More actions</DropdownTrigger>}
          >
            {overflow.map((action) => (
              <action.Component
                key={action.id}
                context={context}
                disabledReason={gridActionDisabledReason(action, context)}
              />
            ))}
          </Dropdown>
        )}
        {explicit && (
          <Button
            size={Size.Sm}
            variant={Variant.Borderless}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "Expand tray" : "Collapse tray"}
          </Button>
        )}
      </div>
      {(selection.error || providerError) && (
        <p role="alert">{selection.error || providerError}</p>
      )}
    </section>
  );
}
