import { useGridSegmentProviders } from "@fiftyone/multimodal/extensions/grid-selection";
import * as fos from "@fiftyone/state";
import {
  getSelectionProviders,
  subsetRequest,
  useGridSelectionBoundary,
  type SavedSubset,
  type SegmentConstraint,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  BookmarkIcon,
  DatabaseIcon,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  GridViewIcon,
  MenuCheckItem,
  MenuSectionTitle,
  MenuSeparator,
  MenuTextItem,
  Size,
  Text,
  TextColor,
  TextVariant,
  TimelineIcon,
} from "@voxel51/voodo";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import styles from "./SelectionTray.module.css";
import { useOpenSubset } from "./useSubsetScope";

interface Props {
  datasetId: string;
  mediaType: string;
  unit: SelectionUnit;
  /** Reports extension provider failures to the tray's summary line. */
  onProviderError: (error: string | null) => void;
}

/** Compact name for an active segment source. */
export function providerLabel(provider: SegmentConstraint | undefined) {
  if (!provider) return null;
  if (provider.kind === "events") return `Events: ${provider.field}`;
  if (provider.kind === "temporal-tags")
    return provider.values.length
      ? `Tag: ${provider.values.join(", ")}`
      : "Temporal tags";
  return provider.label;
}

/**
 * What is being browsed (dataset or a saved subset) and what unit results
 * take (whole parents, saved segments, or segments from a source). Neither
 * control touches explicit tray captures. The unit control only appears when
 * there is something to switch to.
 */
export default function ScopeControls({
  datasetId,
  mediaType,
  unit,
  onProviderError,
}: Props) {
  const [boundary, setBoundary] = useGridSelectionBoundary();
  const clearTemporalTags = fos.useClearTemporalTagConstraint();
  const { refresh } = fos.useGridViewScope();
  const openSubset = useOpenSubset(datasetId);
  const providers = useGridSegmentProviders();
  const [subsets, setSubsets] = useState<readonly SavedSubset[]>([]);
  const [subsetsError, setSubsetsError] = useState<string | null>(null);
  const [options, setOptions] = useState<{
    eventFields: string[];
    temporalTags: string[];
  } | null>(null);
  const controller = useRef<AbortController>();
  const reportError = useRef(onProviderError);
  reportError.current = onProviderError;

  const loadSubsets = useCallback(async () => {
    try {
      const value = await subsetRequest<{ subsets: SavedSubset[] }>(
        datasetId,
        "",
      );
      setSubsets(value.subsets);
      setSubsetsError(null);
    } catch (cause) {
      setSubsetsError(String(cause));
    }
  }, [datasetId]);

  // This effect loads subset names and built-in segment sources for the
  // dataset, and cancels any in-flight extension provider on dataset changes.
  useEffect(() => {
    let active = true;
    void loadSubsets();
    getSelectionProviders(datasetId)
      .then((value) => {
        if (active) setOptions(value);
      })
      .catch((cause: unknown) => {
        if (active) {
          setOptions({ eventFields: [], temporalTags: [] });
          reportError.current(String(cause));
        }
      });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, [datasetId, refresh, loadSubsets]);

  const choose = (provider: SegmentConstraint | undefined) => {
    controller.current?.abort();
    reportError.current(null);
    if (!provider) clearTemporalTags();
    setBoundary({ ...boundary, provider });
  };

  const resolveExtension = async (
    provider: ReturnType<typeof useGridSegmentProviders>[number],
  ) => {
    controller.current?.abort();
    const pending = new AbortController();
    controller.current = pending;
    reportError.current(null);
    try {
      const members = await provider.resolve(datasetId, pending.signal);
      if (!pending.signal.aborted)
        setBoundary({
          ...boundary,
          provider: { kind: "ranges", label: provider.label, members },
        });
    } catch (cause) {
      if (!pending.signal.aborted) reportError.current(String(cause));
    }
  };

  const active = subsets.find((subset) => subset.id === boundary.subsetId);
  const { provider } = boundary;
  const parents = unit === "episode" ? "Whole episodes" : "Samples";
  const wholeLabel =
    boundary.subsetScope === "segments" ? "Saved segments" : parents;
  const extensions = providers.filter((entry) => entry.supports(mediaType));
  const eventFields = options?.eventFields ?? [];
  const temporalTags = options?.temporalTags ?? [];
  const hasSources =
    eventFields.length > 0 || temporalTags.length > 0 || extensions.length > 0;
  const showUnit =
    options !== null &&
    (hasSources || Boolean(provider) || boundary.subsetScope === "segments");

  return (
    <>
      <Dropdown
        anchor={DropdownAnchor.TopStart}
        trigger={
          <DropdownTrigger
            size={Size.Xs}
            leadingIcon={boundary.subsetId ? BookmarkIcon : DatabaseIcon}
            onClick={() => void loadSubsets()}
          >
            <span className={styles.truncate}>
              {boundary.subsetId
                ? (active?.name ?? "Unavailable subset")
                : "Dataset"}
            </span>
          </DropdownTrigger>
        }
      >
        <MenuSectionTitle>Browse</MenuSectionTitle>
        <MenuCheckItem
          checked={!boundary.subsetId}
          onClick={() => openSubset()}
        >
          Entire dataset
        </MenuCheckItem>
        {subsets.map((subset) => (
          <Fragment key={subset.id}>
            <MenuSeparator />
            <MenuSectionTitle>
              {subset.counts.unavailable
                ? `${subset.name} · ${subset.counts.unavailable} unavailable`
                : subset.name}
            </MenuSectionTitle>
            {(subset.counts.fullEpisodes > 0 || !subset.counts.segments) && (
              <MenuCheckItem
                checked={
                  active?.id === subset.id &&
                  boundary.subsetScope !== "segments"
                }
                onClick={() => openSubset(subset.id, "episodes")}
              >
                {`${parents} · ${subset.counts.fullEpisodes}`}
              </MenuCheckItem>
            )}
            {subset.counts.segments > 0 && (
              <MenuCheckItem
                checked={
                  active?.id === subset.id &&
                  boundary.subsetScope === "segments"
                }
                onClick={() => openSubset(subset.id, "segments")}
              >
                {`Saved segments · ${subset.counts.segments}`}
              </MenuCheckItem>
            )}
          </Fragment>
        ))}
        {subsetsError && (
          <>
            <MenuSeparator />
            <MenuTextItem disabled>{subsetsError}</MenuTextItem>
          </>
        )}
        {!subsets.length && !subsetsError && (
          <>
            <MenuSeparator />
            <MenuTextItem disabled>No saved subsets yet</MenuTextItem>
          </>
        )}
      </Dropdown>
      {showUnit && !hasSources && !provider ? (
        <span className={styles.staticScope}>
          <TimelineIcon size={Size.Xs} color={TextColor.Secondary} />
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            {wholeLabel}
          </Text>
        </span>
      ) : showUnit ? (
        <Dropdown
          anchor={DropdownAnchor.TopStart}
          trigger={
            <DropdownTrigger
              size={Size.Xs}
              leadingIcon={provider ? TimelineIcon : GridViewIcon}
            >
              <span className={styles.truncate}>
                {provider
                  ? `Segments · ${providerLabel(provider)}`
                  : wholeLabel}
              </span>
            </DropdownTrigger>
          }
        >
          <MenuSectionTitle>Results as</MenuSectionTitle>
          <MenuCheckItem checked={!provider} onClick={() => choose(undefined)}>
            {wholeLabel}
          </MenuCheckItem>
          <MenuSeparator />
          <MenuSectionTitle>Segments matching</MenuSectionTitle>
          {eventFields.map((field) => (
            <MenuCheckItem
              key={`events:${field}`}
              checked={provider?.kind === "events" && provider.field === field}
              onClick={() => choose({ kind: "events", field, values: [] })}
            >
              {`Events: ${field}`}
            </MenuCheckItem>
          ))}
          {temporalTags.map((tag) => (
            <MenuCheckItem
              key={`tag:${tag}`}
              checked={
                provider?.kind === "temporal-tags" &&
                provider.values.length === 1 &&
                provider.values[0] === tag
              }
              onClick={() => choose({ kind: "temporal-tags", values: [tag] })}
            >
              {`Temporal tag: ${tag}`}
            </MenuCheckItem>
          ))}
          {extensions.map((entry) => (
            <MenuCheckItem
              key={entry.id}
              checked={
                provider?.kind === "ranges" && provider.label === entry.label
              }
              onClick={() => void resolveExtension(entry)}
            >
              {entry.label}
            </MenuCheckItem>
          ))}
          {!hasSources && (
            <MenuTextItem disabled>
              No segment sources in this dataset
            </MenuTextItem>
          )}
        </Dropdown>
      ) : null}
    </>
  );
}
