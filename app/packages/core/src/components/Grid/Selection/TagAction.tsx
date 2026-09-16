import type {
  GridSelectionAction,
  GridSelectionActionContext,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { useRefresh, useSelectionTagDisabledReason } from "@fiftyone/state";
import {
  normalizeSelectionMembers,
  selectionTagsRequest,
  useInvalidateSelectionScope,
  type SelectionCounts,
  type SelectionScope,
  type SelectionUnit,
  type ViewConversion,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  Button,
  CheckIcon,
  ErrorOutlineIcon,
  Input,
  LoadingDots,
  RefreshIcon,
  SearchIcon,
  Size,
  Spinner,
  TagIcon,
  Text,
  TextColor,
  TextVariant,
  Variant,
  WarningAmberIcon,
} from "@voxel51/voodo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionEntry from "./ActionEntry";
import ActionSurface from "./ActionSurface";
import { scopePhrase, unitTitlePlural } from "./format";
import { Notice } from "./Notice";
import Segmented from "./Segmented";
import styles from "./SelectionTray.module.css";

interface Capture {
  datasetId: string;
  mediaType: string;
  unit: SelectionUnit;
  conversion: ViewConversion | null;
  view: readonly unknown[];
  source: GridSelectionActionContext["source"];
  scope: SelectionScope;
  counts: SelectionCounts;
}

type Target = "members" | "labels";

interface TagState {
  tags: readonly string[];
  applied: Readonly<Record<string, number>>;
  targets: number;
  labels: number | null;
}

function TagSelection({
  context,
  disabledReason,
  surface = "toolbar",
}: GridSelectionActionProps) {
  const permission = useSelectionTagDisabledReason();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const resolved = await context.resolve();
      setCapture({
        datasetId: context.datasetId,
        mediaType: context.mediaType,
        unit: context.unit,
        conversion: context.conversion,
        view: context.view,
        source: context.source,
        counts: context.counts,
        scope:
          resolved.kind === "members"
            ? {
                kind: "members",
                members: normalizeSelectionMembers(resolved.members),
              }
            : resolved,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const close = () => setCapture(null);
  return (
    <>
      <ActionSurface
        open={Boolean(capture)}
        onClose={close}
        title="Tag"
        surface={surface}
        trigger={
          <ActionEntry
            label="Tag"
            icon={TagIcon}
            surface={surface}
            onClick={() => (capture ? close() : void begin())}
            disabledReason={permission ?? disabledReason}
            busy={busy}
            busyLabel="Preparing…"
            aria-haspopup="dialog"
            aria-expanded={Boolean(capture)}
          />
        }
      >
        {capture && <TagPicker capture={capture} />}
      </ActionSurface>
      {error && (
        <Text
          role="alert"
          variant={TextVariant.Xs}
          color={TextColor.Destructive}
        >
          {error}
        </Text>
      )}
    </>
  );
}

/**
 * Tags a frozen scope in place. Each row is a tag; a press adds it to every
 * target, or removes it when every target already carries it. The list
 * shows what is on all, on some, or on none, so the next press is obvious.
 */
function TagPicker({ capture }: { capture: Capture }) {
  const permission = useSelectionTagDisabledReason();
  const invalidate = useInvalidateSelectionScope(capture.datasetId);
  const refresh = useRefresh();
  const { unit, counts } = capture;
  // Patches are labels, so their picker only tags labels.
  const labelsOnly = capture.conversion === "patches";
  const [target, setTarget] = useState<Target>(
    labelsOnly ? "labels" : "members",
  );
  // Grouped datasets tag the captured slice by default; every slice on request.
  const grouped = capture.mediaType === "group";
  const [groupScope, setGroupScope] = useState<"slice" | "all">("slice");
  const options = useMemo(
    () => ({
      target,
      view: capture.view,
      groups: grouped ? groupScope : undefined,
    }),
    [target, capture.view, grouped, groupScope],
  );
  const [state, setState] = useState<TagState | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef(0);

  const load = useCallback(async () => {
    const request = ++requests.current;
    setState(null);
    setError(null);
    try {
      const result = await selectionTagsRequest(
        capture.datasetId,
        capture.scope,
        options,
      );
      if (request === requests.current) setState(result);
    } catch (cause) {
      if (request === requests.current) setError(String(cause));
    }
  }, [capture.datasetId, capture.scope, options]);
  // This effect reads the scope's tags when the picker opens and whenever
  // its target or slice choice changes.
  useEffect(() => {
    void load();
  }, [load]);

  const tag = query.trim();
  const needle = tag.toLowerCase();
  const tags = state?.tags ?? [];
  const filtered = tags.filter((value) => value.toLowerCase().includes(needle));
  const known = tags.includes(tag);
  const total = state?.targets ?? 0;
  const noLabels = target === "labels" && state !== null && !state.labels;
  const blocked = Boolean(permission) || !state || noLabels;
  const stateOf = (value: string): "none" | "some" | "all" => {
    const count = state?.applied[value] ?? 0;
    if (count <= 0) return "none";
    return total > 0 && count >= total ? "all" : "some";
  };

  const change = async (value: string, add: boolean, created = false) => {
    if (blocked || busy) return;
    setBusy(value);
    setError(null);
    try {
      const result = await selectionTagsRequest(
        capture.datasetId,
        capture.scope,
        { ...options, change: { tag: value, add } },
      );
      setState(result);
      if (created) setQuery("");
      invalidate();
      refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
    }
  };
  const toggle = (value: string) => change(value, stateOf(value) !== "all");
  const submit = () => {
    if (!tag) return;
    if (known) void toggle(tag);
    else void change(tag, true, true);
  };

  return (
    <div className={styles.sheetBody}>
      <Text
        variant={TextVariant.Label}
        color={TextColor.Secondary}
        className={styles.sheetTitle}
      >
        {`Tag ${scopePhrase(capture.source, counts, unit)}`}
      </Text>
      <Segmented<Target>
        label="Tag"
        value={target}
        disabled={Boolean(busy)}
        options={[
          {
            value: "members",
            label: unit.temporal ? "Episodes" : unitTitlePlural(unit),
            disabledReason: labelsOnly
              ? "Patches are labels; tag them as labels"
              : null,
          },
          {
            value: "labels",
            label: "Labels",
            disabledReason: counts.segments
              ? "Label tagging needs whole episodes"
              : null,
          },
        ]}
        onChange={setTarget}
      />
      {grouped && (
        <Segmented<"slice" | "all">
          label="Slices"
          value={groupScope}
          disabled={Boolean(busy)}
          options={[
            { value: "slice", label: "This slice" },
            { value: "all", label: "All slices" },
          ]}
          onChange={setGroupScope}
        />
      )}
      <Input
        size={Size.Md}
        icon={SearchIcon}
        aria-label="Create or find tag"
        placeholder="Create or find tag"
        value={query}
        disabled={!state || Boolean(busy)}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div role="group" aria-label="Tags" className={styles.list}>
        {!state && !error && (
          <LoadingDots
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            text="Loading tags"
          />
        )}
        {filtered.map((value) => {
          const status = stateOf(value);
          const count = state?.applied[value] ?? 0;
          return (
            <button
              key={value}
              type="button"
              className={styles.row}
              data-state={status}
              aria-pressed={status === "all"}
              disabled={blocked || (Boolean(busy) && busy !== value)}
              onClick={() => void toggle(value)}
            >
              <TagIcon
                size={Size.Sm}
                color={
                  status === "none" ? TextColor.Secondary : TextColor.Accent
                }
              />
              <Text variant={TextVariant.Md} className={styles.rowText}>
                {value}
              </Text>
              {busy === value ? (
                <Spinner size={Size.Xs} />
              ) : status === "all" ? (
                <CheckIcon size={Size.Sm} color={TextColor.Accent} />
              ) : status === "some" ? (
                <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                  {`${count} of ${total}`}
                </Text>
              ) : null}
            </button>
          );
        })}
        {state && tag && !known && (
          <button
            type="button"
            className={styles.row}
            disabled={blocked || Boolean(busy)}
            onClick={() => void change(tag, true, true)}
          >
            <AddIcon size={Size.Sm} color={TextColor.Secondary} />
            <Text variant={TextVariant.Md} className={styles.rowText}>
              {`Create “${tag}”`}
            </Text>
          </button>
        )}
        {state && !filtered.length && !tag && (
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            className={styles.listEmpty}
          >
            No tags yet. Type a name to create one.
          </Text>
        )}
      </div>
      {noLabels && (
        <Notice
          tone="warning"
          icon={WarningAmberIcon}
          title={
            unit.temporal
              ? "No labels in these episodes."
              : `No labels in these ${unit.many}.`
          }
        />
      )}
      {permission && (
        <Notice
          tone="error"
          icon={ErrorOutlineIcon}
          role="alert"
          title={permission}
        />
      )}
      {error && (
        <Notice tone="error" icon={ErrorOutlineIcon} role="alert" title={error}>
          {state
            ? "Press the tag again to retry."
            : "Your captured scope is kept for retry."}
        </Notice>
      )}
      {error && !state && (
        <div className={styles.sheetActions}>
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            leadingIcon={RefreshIcon}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

/** Shared OSS/Enterprise action for exact episode and segment tagging. */
export const tagSelectionAction: GridSelectionAction = {
  id: "fiftyone:tag-selection",
  order: 10,
  label: "Tag",
  placement: "primary",
  supports: () => true,
  scope: "explicit-or-results",
  memberKinds: ["episode", "segment"],
  unavailable: (context) => {
    if (context.counts.unavailable)
      return "Remove unavailable episodes before tagging";
    if (
      context.groups.some((group) =>
        group.members.some(
          (member) =>
            member.kind === "segment" &&
            !["sequence", "duration-ns", "timestamp-ns"].includes(
              member.range.timebase,
            ),
        ),
      )
    )
      return "This segment timebase does not support tags";
    return null;
  },
  Component: TagSelection,
};
