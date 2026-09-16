import { useGridSegmentProviders } from "@fiftyone/multimodal/extensions/grid-selection";
import * as fos from "@fiftyone/state";
import {
  getSelectionProviders,
  useGridSelectionBoundary,
  type SegmentConstraint,
  type SelectionUnit,
  type ViewConversion,
} from "@fiftyone/state/src/selection";
import {
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
import { useEffect, useRef, useState } from "react";
import { unitTitlePlural } from "./format";
import styles from "./SelectionTray.module.css";

interface Props {
  datasetId: string;
  mediaType: string;
  unit: SelectionUnit;
  /** Converted views select their own elements; segment sources stay in the samples view. */
  conversion: ViewConversion | null;
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
 * What unit results take: whole parents, saved segments, or segments from a
 * source. The browsing scope itself (every sample or one saved subset) is
 * chosen in the samples panel tab. This control never touches explicit tray
 * captures and only appears when there is something to switch to.
 */
export default function ScopeControls({
  datasetId,
  mediaType,
  unit,
  conversion,
  onProviderError,
}: Props) {
  const [boundary, setBoundary] = useGridSelectionBoundary();
  const clearTemporalTags = fos.useClearTemporalTagConstraint();
  const { refresh } = fos.useGridViewScope();
  const providers = useGridSegmentProviders();
  const [options, setOptions] = useState<{
    eventFields: string[];
    temporalTags: string[];
  } | null>(null);
  const controller = useRef<AbortController>();
  const reportError = useRef(onProviderError);
  reportError.current = onProviderError;

  // This effect loads the dataset's built-in segment sources, and cancels
  // any in-flight extension provider on dataset changes.
  useEffect(() => {
    if (conversion) return undefined;
    let active = true;
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
  }, [datasetId, refresh, conversion]);

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

  const { provider } = boundary;
  const parents = unit.temporal ? `Whole ${unit.many}` : unitTitlePlural(unit);
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

  if (conversion)
    return (
      <span className={styles.staticScope}>
        <GridViewIcon size={Size.Xs} color={TextColor.Secondary} />
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          {`${unitTitlePlural(unit)} view`}
        </Text>
      </span>
    );
  if (!showUnit) return null;
  if (!hasSources && !provider)
    return (
      <span className={styles.staticScope}>
        <TimelineIcon size={Size.Xs} color={TextColor.Secondary} />
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          {wholeLabel}
        </Text>
      </span>
    );

  return (
    <Dropdown
      anchor={DropdownAnchor.TopStart}
      trigger={
        <DropdownTrigger
          size={Size.Xs}
          leadingIcon={provider ? TimelineIcon : GridViewIcon}
        >
          <span className={styles.truncate}>
            {provider ? `Segments · ${providerLabel(provider)}` : wholeLabel}
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
        <MenuTextItem disabled>No segment sources in this dataset</MenuTextItem>
      )}
    </Dropdown>
  );
}
