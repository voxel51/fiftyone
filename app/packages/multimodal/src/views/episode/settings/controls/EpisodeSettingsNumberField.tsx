import { usePointerLockDrag } from "@fiftyone/playback";
import { useEffect, useRef, useState } from "react";
import settingsStyles from "../../tiles/EpisodeTile.settings.module.css";

// Linear scrub travel per `step`; Shift divides the step by 10 for fine
// adjustment. Multiplicative travel matches the timeline speed control so
// ratio-like values scrub with the same hand feel everywhere.
const PX_PER_STEP = 4;
const PX_PER_DOUBLING = 130;
const FINE_FACTOR = 0.1;
// Arrow keys nudge by one step; Shift+arrow jumps by ten.
const COARSE_NUDGE_STEPS = 10;

interface EpisodeSettingsNumberFieldBaseProps {
  readonly ariaLabel: string;
  /**
   * "change" (default) commits every keystroke whose draft parses; "blur"
   * holds edits until blur/Enter — for values that also update live from
   * outside (e.g. the camera pose) so half-typed numbers never fight the
   * scene.
   */
  readonly commitOn?: "change" | "blur";
  readonly disabled?: boolean;
  /** Display formatting for the committed value while not editing. */
  readonly format?: (value: number) => string;
  /**
   * How scrub travel maps to value change. Linear moves px-per-step;
   * multiplicative doubles/halves per fixed travel — for ratio-like
   * quantities (distances, near/far planes) where a fixed step would be
   * coarse at the small end and twitchy at the large end.
   */
  readonly mapping?: "linear" | "multiplicative";
  readonly max?: number;
  readonly min?: number;
  /** Shown while the value is null (e.g. "auto"). */
  readonly placeholder?: string;
  readonly step?: number;
  /** Unit suffix rendered after the input (e.g. "ms"). */
  readonly unit?: string;
}

/**
 * Empty-draft policy discriminates the value/commit types: "null" fields
 * (auto/unset semantics) carry `number | null`, everything else stays
 * non-nullable at the call site.
 */
export type EpisodeSettingsNumberFieldProps =
  EpisodeSettingsNumberFieldBaseProps &
    (
      | {
          readonly empty: "null";
          readonly onCommit: (value: number | null) => void;
          readonly value: number | null;
        }
      | {
          readonly empty?: "revert";
          readonly onCommit: (value: number) => void;
          readonly value: number;
        }
    );

/**
 * The one numeric input for episode settings surfaces — a Blender-style
 * scrubbable field, generalized from the timeline's speed control:
 *
 * - drag horizontally to scrub (Pointer-Lock relative motion, so the drag
 *   never runs out of screen; Shift scrubs 10× finer),
 * - click to type an exact value (draft buffers the raw string, so `""`,
 *   `-`, and `1.` pass through while typing; Enter/blur commits, Escape
 *   restores the pre-edit value),
 * - arrow keys nudge by one step, Shift+arrow by ten.
 *
 * Scrub emissions are coalesced to one commit per animation frame so
 * pointer-move rates never amplify into per-move store writes.
 */
export function EpisodeSettingsNumberField(
  props: EpisodeSettingsNumberFieldProps,
) {
  const {
    ariaLabel,
    commitOn = "change",
    disabled = false,
    format = formatNumber,
    mapping = "linear",
    max,
    min,
    placeholder,
    step = 1,
    unit,
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // Latest committed value, readable from drag/keyboard callbacks without
  // re-binding them; also the value Escape restores after an edit session.
  const valueRef = useRef(props.value);
  valueRef.current = props.value;
  const editStartValueRef = useRef(props.value);

  const clamp = (value: number): number =>
    Math.min(
      max ?? Number.POSITIVE_INFINITY,
      Math.max(min ?? Number.NEGATIVE_INFINITY, value),
    );

  const commit = (value: number) => {
    // The discriminated union narrows per branch; both accept a number.
    (props.onCommit as (next: number) => void)(clamp(roundFloat(value)));
  };
  const commitNull = () => {
    if (props.empty === "null") props.onCommit(null);
  };

  // Focus + select-all once the input flips to editable, so typing overwrites.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const beginEdit = () => {
    if (disabled) return;
    editStartValueRef.current = valueRef.current;
    setDraft(valueRef.current === null ? "" : String(valueRef.current));
    setEditing(true);
  };

  const handleDraftChange = (raw: string) => {
    setDraft(raw);
    if (commitOn !== "change") return;
    if (raw.trim() === "") {
      // Only null-policy fields commit emptiness live; revert fields wait
      // for blur so clearing-to-retype never writes a bogus value.
      commitNull();
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) commit(parsed);
  };

  const commitEdit = () => {
    setEditing(false);
    if (draft.trim() === "") {
      if (props.empty === "null") commitNull();
      // "revert": the display re-reads the committed value.
      return;
    }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) commit(parsed);
  };

  const cancelEdit = () => {
    setEditing(false);
    const initial = editStartValueRef.current;
    if (initial === valueRef.current) return;
    // "change" mode already committed keystrokes; restore the pre-edit value.
    if (initial === null) commitNull();
    else commit(initial);
  };

  const nudge = (direction: 1 | -1, coarse: boolean) => {
    const base = editing ? Number(draft) : (valueRef.current ?? NaN);
    const from = Number.isFinite(base) ? base : (valueRef.current ?? min ?? 0);
    const next = clamp(
      roundFloat(from + direction * step * (coarse ? COARSE_NUDGE_STEPS : 1)),
    );
    if (editing) setDraft(String(next));
    commit(next);
  };

  // Scrub state: `raw` integrates unquantized motion so sub-step movement
  // is never lost; emissions quantize to the active (possibly fine) step
  // and coalesce to one commit per animation frame.
  const scrubRawRef = useRef<number | null>(null);
  const lastCumulativeRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );
  const flushScrub = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingRef.current !== null) {
      commit(pendingRef.current);
      pendingRef.current = null;
    }
  };

  const scrub = usePointerLockDrag({
    axis: "horizontal",
    onDragStart: () => {
      // A null (auto) value has nothing to scrub from — type-only until set.
      scrubRawRef.current = valueRef.current;
      lastCumulativeRef.current = 0;
    },
    onDelta: (cumulative, modifiers) => {
      if (scrubRawRef.current === null) return;
      const increment = cumulative - lastCumulativeRef.current;
      lastCumulativeRef.current = cumulative;
      const fine = modifiers.shiftKey ? FINE_FACTOR : 1;
      if (mapping === "multiplicative") {
        scrubRawRef.current *= 2 ** ((increment * fine) / PX_PER_DOUBLING);
        pendingRef.current = clamp(scrubRawRef.current);
      } else {
        scrubRawRef.current += (increment / PX_PER_STEP) * step * fine;
        const quantum = step * fine;
        pendingRef.current = clamp(
          Math.round(scrubRawRef.current / quantum) * quantum,
        );
      }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (pendingRef.current !== null) {
            commit(pendingRef.current);
            pendingRef.current = null;
          }
        });
      }
    },
    onDragEnd: flushScrub,
    // A press that never became a drag is a click → open for typing.
    onClick: beginEdit,
  });

  const display = props.value === null ? "" : format(props.value);

  return (
    <span className={settingsStyles.numberFieldWrap}>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={props.value ?? undefined}
        className={settingsStyles.numberField}
        disabled={disabled}
        inputMode="decimal"
        onBlur={() => {
          if (editing) commitEdit();
        }}
        onChange={(event) => handleDraftChange(event.target.value)}
        onFocus={() => {
          // Keyboard focus (tab) opens editing directly; scrub presses
          // preventDefault, so a drag never lands here.
          if (!editing) beginEdit();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            nudge(1, event.shiftKey);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            nudge(-1, event.shiftKey);
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (editing) commitEdit();
            else beginEdit();
          } else if (event.key === "Escape" && editing) {
            event.preventDefault();
            cancelEdit();
          }
        }}
        onPointerDown={(event) => {
          // While already editing, leave pointer handling to the text field
          // so caret placement / selection work normally.
          if (!editing && !disabled) scrub.handleProps.onPointerDown(event);
        }}
        placeholder={placeholder}
        readOnly={!editing}
        role="spinbutton"
        type="text"
        value={editing ? draft : display}
      />
      {unit ? (
        <span className={settingsStyles.numberFieldUnit}>{unit}</span>
      ) : null}
    </span>
  );
}

/** Trim float dust without imposing a fixed precision on large values. */
function roundFloat(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number(value.toPrecision(7)).toString();
}
