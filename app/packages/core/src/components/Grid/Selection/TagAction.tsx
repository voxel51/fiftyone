import type {
  GridSelectionAction,
  GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { useRefresh, useSelectionTagDisabledReason } from "@fiftyone/state";
import {
  normalizeSelectionMembers,
  selectionTagsRequest,
  useInvalidateSelectionScope,
  type SelectionMember,
} from "@fiftyone/state/src/selection";
import {
  Button,
  Popover,
  PopoverAnchor,
  SearchIcon,
  TagIcon,
  Input,
  Size,
  Text,
  TextVariant,
  Variant,
  cssVar,
} from "@voxel51/voodo";
import { useState } from "react";
import styles from "./SelectionTray.module.css";

interface Capture {
  datasetId: string;
  source: GridSelectionActionContext["source"];
  members: readonly SelectionMember[];
  tags: readonly string[];
}

function TagSelection({
  context,
  disabledReason,
}: {
  context: GridSelectionActionContext;
  disabledReason: string | null;
}) {
  const permission = useSelectionTagDisabledReason();
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = permission ?? disabledReason;
  return (
    <>
      <Popover
        open={Boolean(capture)}
        onOpenChange={(open) => {
          if (!open && !busy) setCapture(null);
        }}
        anchor={PopoverAnchor.TopStart}
        panelClassName={styles.tagPicker}
        trigger={
          <Button
            size={Size.Sm}
            variant={Variant.Borderless}
            leadingIcon={TagIcon}
            disabled={Boolean(reason) || busy}
            title={reason ?? undefined}
            onClick={async () => {
              if (capture) {
                setCapture(null);
                return;
              }
              setBusy(true);
              setError(null);
              try {
                const members = normalizeSelectionMembers(
                  await context.resolve(),
                );
                const { tags } = await selectionTagsRequest(
                  context.datasetId,
                  members,
                );
                setCapture({
                  datasetId: context.datasetId,
                  source: context.source,
                  members,
                  tags,
                });
              } catch (cause) {
                setError(String(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && !capture ? "Preparing tags…" : "Tag"}
          </Button>
        }
      >
        {capture && (
          <TagDialog
            capture={capture}
            busy={busy}
            setBusy={setBusy}
            close={() => setCapture(null)}
          />
        )}
      </Popover>
      {error && (
        <Text role="alert" variant={TextVariant.Sm}>
          {error}
        </Text>
      )}
    </>
  );
}

function TagDialog({
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
  const [tag, setTag] = useState("");
  const [target, setTarget] = useState<"members" | "labels">("members");
  const [tags, setTags] = useState(capture.tags);
  const [labelCount, setLabelCount] = useState<number | null>(null);
  const [add, setAdd] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = capture.members.filter(
    (member) => member.kind === "episode",
  ).length;
  const segments = capture.members.length - full;

  return (
    <div aria-label="Tag captured scope" style={{ padding: cssVar.spacing.md }}>
      <Text variant={TextVariant.Md} style={{ display: "block" }}>
        {target === "labels"
          ? `TAG ${labelCount ?? 0} LABELS`
          : `TAG ${full ? `${full} EPISODE${full === 1 ? "" : "S"}` : ""}${full && segments ? " · " : ""}${segments ? `${segments} SEGMENT${segments === 1 ? "" : "S"}` : ""}`}
      </Text>
      <Text variant={TextVariant.Sm} style={{ display: "block" }}>
        {capture.source === "explicit"
          ? "Captured selection"
          : "Captured all current results"}
      </Text>
      <div className={styles.tagModes}>
        <Button
          size={Size.Sm}
          variant={
            target === "members" ? Variant.Secondary : Variant.Borderless
          }
          aria-pressed={target === "members"}
          disabled={busy || done}
          onClick={() => {
            setTarget("members");
            setTags(capture.tags);
            setTag("");
          }}
        >
          {segments ? (full ? "Samples & segments" : "Segments") : "Samples"}
        </Button>
        <Button
          size={Size.Sm}
          variant={target === "labels" ? Variant.Secondary : Variant.Borderless}
          aria-pressed={target === "labels"}
          disabled={busy || done || segments > 0}
          title={segments ? "Label tagging requires whole episodes" : undefined}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const result = await selectionTagsRequest(
                capture.datasetId,
                capture.members,
                undefined,
                "labels",
              );
              setTarget("labels");
              setTags(result.tags);
              setLabelCount(result.labels);
              setTag("");
            } catch (cause) {
              setError(String(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          Labels
        </Button>
      </div>
      <Text variant={TextVariant.Sm}>
        {target === "labels"
          ? "All labels in these whole episodes"
          : segments
            ? "Temporal tags on captured ranges and streams"
            : "Sample tags on whole episodes"}
      </Text>
      {!done && (
        <>
          <div className={styles.tagModes}>
            <Button
              size={Size.Sm}
              variant={add ? Variant.Secondary : Variant.Borderless}
              aria-pressed={add}
              disabled={busy}
              onClick={() => setAdd(true)}
            >
              Add tag
            </Button>
            <Button
              size={Size.Sm}
              variant={!add ? Variant.Secondary : Variant.Borderless}
              aria-pressed={!add}
              disabled={busy}
              onClick={() => setAdd(false)}
            >
              Remove tag
            </Button>
          </div>
          {!add && segments > 0 && (
            <p>
              Removal affects exact ranges and streams only. Overlapping tags
              remain.
            </p>
          )}
          <Input
            aria-label="Create or find tag"
            value={tag}
            placeholder="Create or find tag"
            icon={SearchIcon}
            disabled={busy}
            onChange={(event) => setTag(event.target.value)}
          />
          {tags.length > 0 && (
            <fieldset className={styles.tagList} disabled={busy}>
              <legend className={styles.visuallyHidden}>Available tags</legend>
              {tags
                .filter((value) =>
                  value.toLowerCase().includes(tag.toLowerCase()),
                )
                .map((value) => (
                  <Button
                    key={value}
                    leadingIcon={TagIcon}
                    size={Size.Sm}
                    variant={Variant.Borderless}
                    onClick={() => setTag(value)}
                  >
                    {value}
                  </Button>
                ))}
            </fieldset>
          )}
        </>
      )}
      {target === "labels" && labelCount === 0 && (
        <p>No labels in these episodes.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {permission && <p role="alert">{permission}</p>}
      {done && (
        <p role="status">
          Tag {add ? "added to" : "removed from"} the captured scope. Selection
          retained.
        </p>
      )}
      <div className={styles.dialogActions}>
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          disabled={busy}
          onClick={close}
        >
          {done ? "Done" : "Cancel"}
        </Button>
        {!done && (
          <Button
            size={Size.Sm}
            disabled={
              busy ||
              Boolean(permission) ||
              !tag.trim() ||
              (target === "labels" && !labelCount)
            }
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await selectionTagsRequest(
                  capture.datasetId,
                  capture.members,
                  {
                    tag: tag.trim(),
                    add,
                  },
                  target,
                );
                setDone(true);
                invalidate();
                refresh();
              } catch (cause) {
                setError(String(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Applying…"
              : add
                ? "Apply tag"
                : "Remove from captured scope"}
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
  supports: (mediaType) => ["video", "multimodal"].includes(mediaType),
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
