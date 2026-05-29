import {
  Button,
  Descriptor,
  Select,
  SelectAnchor,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
  ZIndex,
} from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtBound } from "../TimelineControls/timeline-controls-utils";
import { useTemporalTagContext } from "./TemporalTagContext";
import styles from "./TemporalTag.module.css";

const NUDGE_STEP = 0.1;
const NEW_TAG_SENTINEL = "__new__";

function pickTopLeft(
  anchor: { x: number; y: number },
  size: { width: number; height: number }
) {
  const vp = { width: window.innerWidth, height: window.innerHeight };
  const top =
    anchor.y + size.height > vp.height
      ? anchor.y - size.height - 8
      : anchor.y + 8;
  const left =
    anchor.x + size.width > vp.width ? anchor.x - size.width : anchor.x;
  return { top, left };
}

/**
 * Popup anchored near the completed tag selection. When existing tags are
 * present the user can pick one from a dropdown to add a new time range to
 * that tag, or choose "New tag…" to type a fresh label.
 */
const TemporalTagPopup: React.FC = () => {
  const ctx = useTemporalTagContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { state, actions } = ctx ?? {};
  const existingTags = ctx?.existingTags ?? [];
  const hasExisting = existingTags.length > 0;

  // Always start in new-tag mode so the user can type a fresh label immediately.
  const [isNewTag, setIsNewTag] = useState(true);

  // Reset to new-tag mode each time the popup opens.
  useEffect(() => {
    if (state?.phase !== "selected") return;
    setIsNewTag(true);
    setError(null);
    setSubmitting(false);
    actions?.setLabel("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase]);

  // Auto-focus: select when there are existing tags, input otherwise.
  useEffect(() => {
    if (state?.phase !== "selected") return undefined;
    if (!hasExisting) {
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [state?.phase, hasExisting]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions?.exitTagMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);

  const handleSubmit = useCallback(async () => {
    if (!ctx || !ctx.state.selection || !ctx.onTagCreate) return;
    const { selection, pendingLabel } = ctx.state;
    if (!pendingLabel.trim()) {
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await ctx.onTagCreate({
        start: selection.start,
        end: selection.end,
        tag: pendingLabel.trim(),
      });
      ctx.actions.exitTagMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tag.");
    } finally {
      setSubmitting(false);
    }
  }, [ctx]);

  const selectOptions = useMemo<Descriptor<{ label: string }>[]>(() => [
    ...existingTags.map((tag) => ({ id: tag, data: { label: tag } })),
    { id: NEW_TAG_SENTINEL, data: { label: "New tag…" } },
  ], [existingTags]);

  if (!ctx || state?.phase !== "selected" || !state.anchor) return null;

  const { anchor, selection, pendingLabel } = state;
  const popupSize = { width: 260, height: hasExisting ? 240 : 200 };
  const { top, left } = pickTopLeft(anchor, popupSize);

  const nudgeStart = (delta: number) => {
    if (!selection) return;
    const next = Math.max(0, selection.start + delta);
    if (next < selection.end) actions?.setAnchorHandle(next, selection.end);
  };
  const nudgeEnd = (delta: number) => {
    if (!selection) return;
    const next = selection.end + delta;
    if (next > selection.start) actions?.setAnchorHandle(selection.start, next);
  };

  const handleDropdownChange = (value: string) => {
    if (value === NEW_TAG_SENTINEL) {
      setIsNewTag(true);
      actions?.setLabel("");
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setIsNewTag(false);
      actions?.setLabel(value);
    }
  };

  return createPortal(
    <div
      className={styles.popup}
      style={{ top, left }}
      role="dialog"
      aria-label="Create temporal tag"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Text variant={TextVariant.Sm} color={TextColor.Secondary} className={styles.popupLabel}>
        Add temporal tag
      </Text>

      {/* Nudge controls */}
      <div className={styles.popupNudge}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary} className={styles.popupNudgeLabel}>Start</Text>
        <Button size={Size.Xs} variant={Variant.Borderless} onClick={() => nudgeStart(-NUDGE_STEP)} aria-label="Start −0.1s">−</Button>
        <Text variant={TextVariant.Xs} color={TextColor.Primary} className={styles.popupNudgeTime}>
          {selection ? fmtBound(selection.start) : "—"}
        </Text>
        <Button size={Size.Xs} variant={Variant.Borderless} onClick={() => nudgeStart(NUDGE_STEP)} aria-label="Start +0.1s">+</Button>
      </div>
      <div className={styles.popupNudge}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary} className={styles.popupNudgeLabel}>End</Text>
        <Button size={Size.Xs} variant={Variant.Borderless} onClick={() => nudgeEnd(-NUDGE_STEP)} aria-label="End −0.1s">−</Button>
        <Text variant={TextVariant.Xs} color={TextColor.Primary} className={styles.popupNudgeTime}>
          {selection ? fmtBound(selection.end) : "—"}
        </Text>
        <Button size={Size.Xs} variant={Variant.Borderless} onClick={() => nudgeEnd(NUDGE_STEP)} aria-label="End +0.1s">+</Button>
      </div>

      {/* Existing-tag picker */}
      {hasExisting && (
        <Select
          exclusive
          portal
          anchor={SelectAnchor.BottomStart}
          zIndex={ZIndex.AboveModal}
          value={isNewTag ? NEW_TAG_SENTINEL : pendingLabel}
          options={selectOptions}
          onChange={(val) => {
            const selected = Array.isArray(val) ? val[0] : val;
            handleDropdownChange(selected ?? NEW_TAG_SENTINEL);
          }}
          disabled={submitting}
          aria-label="Tag"
        />
      )}

      {/* Free-text input — shown when no existing tags or "New tag…" chosen */}
      {(!hasExisting || isNewTag) && (
        <input
          ref={inputRef}
          className={styles.popupInput}
          type="text"
          placeholder="Tag label…"
          value={pendingLabel}
          onChange={(e) => actions?.setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") actions?.cancel();
          }}
          disabled={submitting}
          autoComplete="off"
        />
      )}

      {error && (
        <Text variant={TextVariant.Xs} color={TextColor.Destructive}>{error}</Text>
      )}

      <div className={styles.popupActions}>
        <Button size={Size.Xs} variant={Variant.Borderless} onClick={actions?.exitTagMode} disabled={submitting}>
          Cancel
        </Button>
        <Button size={Size.Xs} variant={Variant.Primary} onClick={handleSubmit} disabled={submitting || !pendingLabel.trim()}>
          {submitting ? "Saving…" : "Accept"}
        </Button>
      </div>
    </div>,
    document.body
  );
};

export default TemporalTagPopup;
