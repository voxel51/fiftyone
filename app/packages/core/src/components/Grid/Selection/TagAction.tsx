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
  type SelectionMember,
  type SelectionUnit,
  type ViewConversion,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  Button,
  CheckCircleOutlineIcon,
  CheckIcon,
  ErrorOutlineIcon,
  Input,
  Modal,
  ModalSize,
  Popover,
  PopoverAnchor,
  SearchIcon,
  Size,
  TagIcon,
  Text,
  TextColor,
  TextVariant,
  Variant,
  WarningAmberIcon,
} from "@voxel51/voodo";
import { useState } from "react";
import ActionEntry from "./ActionEntry";
import { plural, unitTitlePlural } from "./format";
import { Notice, ScopePill } from "./Notice";
import Segmented from "./Segmented";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

interface Capture {
  datasetId: string;
  mediaType: string;
  unit: SelectionUnit;
  conversion: ViewConversion | null;
  view: readonly unknown[];
  source: GridSelectionActionContext["source"];
  members: readonly SelectionMember[];
  tags: readonly string[];
  /** Label count when the scope was read in labels mode, else null. */
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
  const reason = permission ?? disabledReason;
  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const members = normalizeSelectionMembers(await context.resolve());
      // Patches are labels, so their picker opens in labels mode.
      const labelsOnly = context.conversion === "patches";
      const { tags, labels } = await selectionTagsRequest(
        context.datasetId,
        members,
        undefined,
        labelsOnly ? "labels" : "members",
        context.view,
      );
      setCapture({
        datasetId: context.datasetId,
        mediaType: context.mediaType,
        unit: context.unit,
        conversion: context.conversion,
        view: context.view,
        source: context.source,
        members,
        tags,
        labels: labelsOnly ? labels : null,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const close = () => setCapture(null);
  const entry = (
    <ActionEntry
      label="Tag"
      icon={TagIcon}
      surface={surface}
      onClick={() => (capture ? close() : void begin())}
      disabledReason={reason}
      busy={busy && !capture}
      busyLabel="Preparing tags…"
      aria-haspopup="dialog"
      aria-expanded={Boolean(capture)}
    />
  );
  const alert = error && (
    <Text role="alert" variant={TextVariant.Xs} color={TextColor.Destructive}>
      {error}
    </Text>
  );
  const picker = capture && (
    <TagPicker capture={capture} busy={busy} setBusy={setBusy} close={close} />
  );
  if (surface === "menu") {
    return (
      <>
        {entry}
        {alert}
        <Modal
          open={Boolean(capture)}
          onClose={() => {
            if (!busy) close();
          }}
          title="Tag"
          size={ModalSize.Sm}
        >
          <div style={trayTheme}>{picker}</div>
        </Modal>
      </>
    );
  }
  return (
    <>
      <Popover
        open={Boolean(capture)}
        onOpenChange={(open) => {
          if (!open && !busy) close();
        }}
        anchor={PopoverAnchor.TopEnd}
        trigger={entry}
      >
        <div style={trayTheme}>{picker}</div>
      </Popover>
      {alert}
    </>
  );
}

type Target = "members" | "labels";
type Mode = "add" | "remove";

function TagPicker({
  capture,
  close,
  busy,
  setBusy,
}: {
  capture: Capture;
  close: () => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
}) {
  const permission = useSelectionTagDisabledReason();
  const invalidate = useInvalidateSelectionScope(capture.datasetId);
  const refresh = useRefresh();
  const [query, setQuery] = useState("");
  const labelsOnly = capture.conversion === "patches";
  const [target, setTarget] = useState<Target>(
    labelsOnly ? "labels" : "members",
  );
  const [tags, setTags] = useState(capture.tags);
  const [labelCount, setLabelCount] = useState<number | null>(capture.labels);
  const [mode, setMode] = useState<Mode>("add");
  const [done, setDone] = useState<{ tag: string; mode: Mode } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { unit } = capture;
  const parents = unit.temporal ? "Episodes" : unitTitlePlural(unit);
  const full = capture.members.filter((m) => m.kind === "episode").length;
  const segments = capture.members.length - full;
  const tag = query.trim();
  const needle = tag.toLowerCase();
  const filtered = tags.filter((value) => value.toLowerCase().includes(needle));
  const known = tags.includes(tag);
  const membersLabel = segments
    ? full
      ? `${parents} & segments`
      : "Segments"
    : parents;
  const headline =
    target === "labels"
      ? plural(labelCount ?? 0, "label")
      : [
          full &&
            (unit.temporal
              ? plural(full, "full episode")
              : plural(full, unit.one, unit.many)),
          segments && plural(segments, "segment"),
        ]
          .filter(Boolean)
          .join(" · ");
  const canApply =
    !busy &&
    !done &&
    !permission &&
    tag.length > 0 &&
    (mode === "add" || known) &&
    (target !== "labels" || Boolean(labelCount));

  const chooseTarget = async (next: Target) => {
    if (next === target) return;
    setError(null);
    if (next === "members") {
      setTarget("members");
      setTags(capture.tags);
      setLabelCount(null);
      return;
    }
    setBusy(true);
    try {
      const result = await selectionTagsRequest(
        capture.datasetId,
        capture.members,
        undefined,
        "labels",
        capture.view,
      );
      setTarget("labels");
      setTags(result.tags);
      setLabelCount(result.labels);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!canApply) return;
    setBusy(true);
    setError(null);
    try {
      await selectionTagsRequest(
        capture.datasetId,
        capture.members,
        { tag, add: mode === "add" },
        target,
        capture.view,
      );
      setDone({ tag, mode });
      invalidate();
      refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${styles.panel} ${styles.panelWide}`}>
      <div className={styles.panelHeader}>
        <Text variant={TextVariant.Md}>Tag</Text>
        <ScopePill source={capture.source} />
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          {headline}
        </Text>
      </div>
      <Segmented<Target>
        label="Apply to"
        value={target}
        disabled={busy || Boolean(done)}
        options={[
          {
            value: "members",
            label: membersLabel,
            disabledReason: labelsOnly
              ? "Patches are labels; tag them as labels"
              : null,
          },
          {
            value: "labels",
            label: "Labels",
            disabledReason: segments
              ? "Label tagging needs whole episodes"
              : null,
          },
        ]}
        onChange={(value) => void chooseTarget(value)}
      />
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        {target === "labels"
          ? labelsOnly
            ? "The selected patch labels"
            : unit.temporal
              ? "All labels in these whole episodes"
              : `All labels in these ${unit.many}`
          : segments
            ? full
              ? "Sample tags on episodes; temporal tags on captured ranges and streams"
              : "Temporal tags on the captured ranges and streams"
            : unit.temporal
              ? "Sample tags on the whole episodes"
              : `Sample tags on each ${unit.one}`}
      </Text>
      {!done && (
        <>
          <Segmented<Mode>
            label="Change"
            value={mode}
            disabled={busy}
            options={[
              { value: "add", label: "Add" },
              { value: "remove", label: "Remove" },
            ]}
            onChange={setMode}
          />
          <Input
            size={Size.Sm}
            icon={SearchIcon}
            aria-label={mode === "add" ? "Find or create a tag" : "Find a tag"}
            placeholder={mode === "add" ? "Find or create a tag" : "Find a tag"}
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void apply();
              }
            }}
          />
          <div role="group" aria-label="Tags" className={styles.tagList}>
            {filtered.map((value) => {
              const active = value === tag;
              return (
                <button
                  key={value}
                  type="button"
                  className={styles.tagRow}
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => setQuery(value)}
                >
                  <TagIcon
                    size={Size.Sm}
                    color={active ? TextColor.Accent : TextColor.Secondary}
                  />
                  <span className={styles.tagRowText}>{value}</span>
                  {active && (
                    <CheckIcon size={Size.Sm} color={TextColor.Accent} />
                  )}
                </button>
              );
            })}
            {mode === "add" && tag && !known && (
              <button
                type="button"
                className={styles.tagRow}
                disabled={busy || !canApply}
                onClick={() => void apply()}
              >
                <AddIcon size={Size.Sm} color={TextColor.Secondary} />
                <span className={styles.tagRowText}>Create “{tag}”</span>
              </button>
            )}
            {!filtered.length && !(mode === "add" && tag) && (
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Secondary}
                className={styles.tagEmpty}
              >
                {query
                  ? "No matching tags"
                  : mode === "add"
                    ? "Type to create a tag"
                    : "No tags to remove"}
              </Text>
            )}
          </div>
          {mode === "remove" && segments > 0 && (
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Removes only the exact captured ranges and streams. Overlapping
              tags stay.
            </Text>
          )}
        </>
      )}
      {target === "labels" && labelCount === 0 && (
        <Notice
          tone="warning"
          icon={WarningAmberIcon}
          title="No labels in these episodes."
        />
      )}
      {error && (
        <Notice tone="error" icon={ErrorOutlineIcon} role="alert" title={error}>
          Your captured scope is kept for retry.
        </Notice>
      )}
      {permission && (
        <Notice
          tone="error"
          icon={ErrorOutlineIcon}
          role="alert"
          title={permission}
        />
      )}
      {done && (
        <Notice
          tone="success"
          icon={CheckCircleOutlineIcon}
          role="status"
          title={`${done.mode === "add" ? "Added" : "Removed"} “${done.tag}” ${
            done.mode === "add" ? "to" : "from"
          } ${headline}.`}
        >
          Selection kept.
        </Notice>
      )}
      <div className={styles.panelActions}>
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          disabled={busy}
          onClick={close}
        >
          {done ? "Done" : "Cancel"}
        </Button>
        {done ? (
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={() => {
              setDone(null);
              setQuery("");
            }}
          >
            Tag another
          </Button>
        ) : (
          <Button
            size={Size.Sm}
            disabled={!canApply}
            onClick={() => void apply()}
          >
            {busy ? "Applying…" : mode === "add" ? "Add tag" : "Remove tag"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Shared OSS/Enterprise action for exact episode and segment tagging. */
export const tagSelectionAction: GridSelectionAction = {
  id: "fiftyone:tag-selection",
  order: 20,
  label: "Tag",
  placement: "primary",
  supports: (mediaType) => mediaType !== "group",
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
