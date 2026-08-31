/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Edits a view expression as the Python it is written in.
 *
 * The source text is the only representation — `parse` and `print` are exact
 * inverses, so there is no builder model beside it to fall out of sync, and
 * nothing is lost by switching between clicking and typing. What the caret can
 * be offered is decided by {@link caretContext}, which reads the text directly
 * rather than the parse, so a half-typed expression still suggests well.
 */

import { Code } from "@fiftyone/components";
import {
  Align,
  Anchor,
  DatePicker,
  Icon,
  IconName,
  Clickable,
  Orientation,
  Pill,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import React, { useCallback, useMemo, useRef, useState } from "react";

import { tryParse } from "../expression/parse";
import type { Node } from "../expression/types";
import type { Kind, Operator } from "./catalog";
import {
  EDITOR_HEADER_HEIGHT,
  ERROR_COLOR,
  EXPRESSION_BOX_HEIGHT,
} from "../params";
import {
  caretContext,
  completeField,
  kindOf,
  signatureAt,
  suggestFields,
  suggestOperators,
} from "./suggest";

export interface ExpressionEditorProps {
  /** Python source for the expression, e.g. `F("confidence") > 0.5`. */
  value: string;
  onChange: (source: string) => void;
  /** Field paths the dataset has, offered while a field name is being typed. */
  fields?: string[];
  /** Resolves a field path to the kind of value it holds. */
  fieldKind?: (path: string) => Kind | undefined;
  /** The served operator catalog; suggestions come only from here. */
  operators?: Operator[];
  /** Names the parameter from inside the input, so no label sits above it. */
  placeholder?: string;
  /** The editor switcher, laid out inline with the input it governs. */
  tabs?: React.ReactNode;
  /** Waiting on a parameter declared before it. */
  disabled?: boolean;
  /** Why the editor is locked, e.g. `Choose "field" first`. */
  disabledReason?: string;
  /** Committed elsewhere — the editor never reports a parse error while typing. */
  error?: string | null;
  /** The stage is done being described — wired to Shift+Enter. */
  onSubmit?: () => void;
}

/**
 * How the operator is written into the source once chosen.
 *
 * A named operator is a method call — it brings its own dot and parentheses.
 * A symbolic one (`>`, `==`, `&`) is written infix: it replaces any dot the
 * user had typed, because `F("x").>` is not a thing anyone means.
 */
const applySuggestion = (
  source: string,
  offset: number,
  operator: Operator,
): { source: string; offset: number } => {
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_]/.test(source[start - 1])) start--;

  // A half-typed symbolic operator (`=‸` completing to `==`) is replaced too
  if (start === offset) {
    while (start > 0 && /[=<>!+\-*/%&|^~]/.test(source[start - 1])) start--;
  }

  const symbolic = !/^[A-Za-z_]/.test(operator.display);
  const hasDot = source[start - 1] === ".";

  if (symbolic) {
    const from = hasDot ? start - 1 : start;
    const head = `${source.slice(0, from).trimEnd()} ${operator.display} `;
    return { source: head + source.slice(offset), offset: head.length };
  }

  const takesArgs = operator.maxArgs === null || operator.maxArgs > 0;
  const dot = hasDot ? "" : ".";
  const head =
    source.slice(0, start) +
    `${dot}${operator.display}(` +
    (takesArgs ? "" : ")");
  return {
    source: head + (takesArgs ? ")" : "") + source.slice(offset),
    // Land the caret inside the parentheses when there is something to type
    offset: head.length + (takesArgs ? 0 : 0),
  };
};

/**
 * The editor instance, as `Code`'s `onMount` hands it over — typed through the
 * wrapper so this package does not depend on monaco directly.
 */
type OnMount = NonNullable<React.ComponentProps<typeof Code>["onMount"]>;
type CodeEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

/**
 * What the box has to say about the expression as it stands.
 *
 * `empty` invites, `valid` confirms, `invalid` explains. A half-typed
 * expression is `invalid` and says so where the suggestions were, rather than
 * pushing a message in underneath and moving everything.
 */
export type Status =
  | { state: "empty" }
  | { state: "valid" }
  | { state: "invalid"; message: string };

export const statusOf = (source: string, error?: string | null): Status => {
  // A reason the value was rejected outranks anything read from the text
  if (error) return { state: "invalid", message: error };

  if (!source.trim()) return { state: "empty" };

  const parsed = tryParse(source);
  return "error" in parsed
    ? { state: "invalid", message: parsed.error.message }
    : { state: "valid" };
};

const STATUS_ICON: Record<Status["state"], IconName> = {
  empty: IconName.Add,
  valid: IconName.Check,
  invalid: IconName.Error,
};

const STATUS_COLOR: Record<Status["state"], TextColor> = {
  empty: TextColor.Muted,
  valid: TextColor.Success,
  invalid: TextColor.Destructive,
};

const KIND_LABEL: Record<Kind, string> = {
  ANY: "any",
  NUMBER: "number",
  STRING: "string",
  BOOLEAN: "boolean",
  ARRAY: "list",
  OBJECT: "object",
  DATE: "date",
  ID: "id",
};

// Stable default identities, so the memos keyed on them hold between renders
const NO_FIELDS: string[] = [];
const NO_OPERATORS: Operator[] = [];
const NO_KIND = () => undefined;

/** Row ids, so the keyboard can bring its landing spot into view. */
const SUGGESTION_ID = "view-bar-suggestion";

export const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
  value,
  onChange,
  fields = NO_FIELDS,
  fieldKind = NO_KIND,
  // No catalog yet means no operator suggestions — never a stale local copy
  operators = NO_OPERATORS,
  placeholder = 'F("confidence") > 0.5',
  tabs,
  disabled,
  disabledReason,
  error,
  onSubmit,
}) => {
  // The caret offset is the whole basis for what gets suggested; Monaco
  // reports it through cursor events rather than DOM selection state
  const editorRef = useRef<CodeEditor | null>(null);
  const [offset, setOffset] = useState(value.length);
  // Suggestions belong to the keyboard owning the box — they close on blur
  const [focused, setFocused] = useState(false);
  // Escape hides the list until the caret moves again
  const [dismissed, setDismissed] = useState(false);
  // Only the arrow keys drag the list; a wheel or a drag is the user reading
  // ahead, and yanking their scroll back would fight them
  const followKeyboard = useRef(false);
  // Which suggestion the arrow keys have landed on
  const [active, setActive] = useState(0);
  // The mounted handlers read through refs, so they never go stale
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const navRef = useRef<{
    visible: boolean;
    count: number;
    move: (delta: number) => void;
    accept: () => boolean;
    dismiss: () => void;
  }>({
    visible: false,
    count: 0,
    move: () => undefined,
    accept: () => false,
    dismiss: () => undefined,
  });

  const onMount = useCallback((editor: CodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (model) setOffset(model.getOffsetAt(e.position));
    });
    editor.onDidFocusEditorWidget(() => setFocused(true));
    editor.onDidBlurEditorWidget(() => setFocused(false));
    // An expression is one line; Shift+Enter finishes it rather than growing it
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      onSubmitRef.current?.();
    });
    // The arrow keys drive the suggestion list while it is open; Enter takes
    // the landed-on suggestion, Escape puts the list away until the caret
    // moves. With the list closed, every key means what Monaco says it means.
    editor.onKeyDown((e) => {
      const nav = navRef.current;
      if (!nav.visible) return;

      if (e.keyCode === monaco.KeyCode.DownArrow) {
        nav.move(1);
      } else if (e.keyCode === monaco.KeyCode.UpArrow) {
        nav.move(-1);
      } else if (e.keyCode === monaco.KeyCode.Enter && !e.shiftKey) {
        if (!nav.accept()) return;
      } else if (e.keyCode === monaco.KeyCode.Escape) {
        nav.dismiss();
      } else {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
    });
  }, []);

  const context = useMemo(
    () => caretContext(value, Math.min(offset, value.length)),
    [value, offset],
  );

  const receiverKind = useMemo(
    () =>
      context.receiver
        ? kindOf(context.receiver as Node, operators, fieldKind)
        : undefined,
    [context.receiver, operators, fieldKind],
  );

  const suggestions = useMemo(
    () =>
      receiverKind
        ? suggestOperators(receiverKind, context.prefix, operators)
        : [],
    [receiverKind, context.prefix, operators],
  );

  const signature = useMemo(
    () => signatureAt(context, operators),
    [context, operators],
  );

  const fieldMatches = useMemo(
    () => (context.field ? suggestFields(context.field.typed, fields) : []),
    [context.field, fields],
  );

  /** Writes the caret back after React has rendered the new value. */
  const restoreCaret = useCallback((at: number) => {
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      editor.setPosition(model.getPositionAt(at));
      setOffset(at);
      editor.focus();
    });
  }, []);

  const chooseField = useCallback(
    (path: string) => {
      if (!context.field) return;
      // Completing the whole call, closers included, is what hands the caret
      // to operator territory — left inside `F(`, the next `.` would only
      // ever offer deeper field paths
      const next = completeField(value, context.field, path);
      onChange(next.source);
      restoreCaret(next.offset);
    },
    [context.field, value, onChange, restoreCaret],
  );

  const choose = useCallback(
    (operator: Operator) => {
      const next = applySuggestion(value, offset, operator);
      onChange(next.source);
      restoreCaret(next.offset);
    },
    [value, offset, onChange, restoreCaret],
  );

  /** Writes a picked date into the source as `datetime(y, m, d)`. */
  const chooseDate = useCallback(
    (picked: Date) => {
      const text = `datetime(${picked.getFullYear()}, ${
        picked.getMonth() + 1
      }, ${picked.getDate()})`;
      const next = value.slice(0, offset) + text + value.slice(offset);
      onChange(next);
      restoreCaret(offset + text.length);
    },
    [value, offset, onChange, restoreCaret],
  );

  /**
   * The caret sits where a date belongs: as the argument of an operator that
   * takes one, or on the right of a comparison whose left side is a DATE
   * field — `F("created_at") > `.
   */
  const wantsDate = useMemo(() => {
    if (signature?.argKind === "DATE") return true;

    const behind = value.slice(0, offset);
    const comparison = /^(.*?)(==|!=|>=|<=|>|<)\s*$/.exec(behind);
    if (!comparison) return false;

    const parsed = tryParse(comparison[1]);
    if ("error" in parsed) return false;
    return kindOf(parsed.node, operators, fieldKind) === "DATE";
  }, [signature, value, offset, operators, fieldKind]);

  /**
   * The rows exactly as rendered, each with what accepting it does — an
   * operator that does not apply here renders but cannot be landed on.
   */
  const entries = useMemo(() => {
    if (fieldMatches.length > 0) {
      return fieldMatches.slice(0, 24).map((path) => ({
        id: `field:${path}`,
        choose: () => chooseField(path) as void,
      }));
    }
    return suggestions.map(({ operator, applicable }) => ({
      id: `op:${operator.name}`,
      choose: applicable ? () => choose(operator) as void : undefined,
    }));
  }, [fieldMatches, suggestions, chooseField, choose]);

  const listOpen = focused && !dismissed && (entries.length > 0 || wantsDate);

  // The caret moving is what un-dismisses and re-aims the list
  React.useEffect(() => {
    setDismissed(false);
  }, [value, offset]);
  React.useEffect(() => {
    setActive(0);
  }, [entries]);

  React.useEffect(() => {
    if (!followKeyboard.current) return;
    followKeyboard.current = false;
    document
      .getElementById(`${SUGGESTION_ID}-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  navRef.current = {
    visible: listOpen && entries.some((entry) => entry.choose),
    count: entries.length,
    move: (delta: number) => {
      followKeyboard.current = true;
      setActive((current) => {
        // Land only on rows that can be accepted
        let next = current;
        for (let step = 0; step < entries.length; step++) {
          next = (next + delta + entries.length) % entries.length;
          if (entries[next]?.choose) return next;
        }
        return current;
      });
    },
    accept: () => {
      const pick = entries[active]?.choose;
      if (!pick) return false;
      pick();
      return true;
    },
    dismiss: () => setDismissed(true),
  };

  const status = statusOf(value, error);

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      {/*
        The switcher and the status share a line: the status is one glyph and a
        few words, and a row of its own pushed the editor down for nothing.
      */}
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        align={Align.Center}
        style={{
          height: EDITOR_HEADER_HEIGHT,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {tabs}
        {disabled ? (
          // A locked editor's whole header says why, so no one types into a
          // box that cannot answer
          <Stack
            orientation={Orientation.Row}
            spacing={Spacing.Xs}
            align={Align.Center}
          >
            <Icon name={IconName.Lock} size={Size.Sm} color={TextColor.Muted} />
            <Text
              variant={TextVariant.Caption}
              color={TextColor.Muted}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {disabledReason ?? "Waiting on required values"}
            </Text>
          </Stack>
        ) : signature ? (
          <Signature
            operator={signature.operator}
            argIndex={signature.argIndex}
            argKind={signature.argKind}
          />
        ) : (
          <Stack
            orientation={Orientation.Row}
            spacing={Spacing.Xs}
            align={Align.Center}
          >
            <Icon
              name={STATUS_ICON[status.state]}
              size={Size.Sm}
              color={STATUS_COLOR[status.state]}
            />
            <Tooltip
              content={
                status.state === "invalid"
                  ? status.message
                  : status.state === "valid"
                    ? "Ready to apply"
                    : 'Start with a field — F("…") then a dot'
              }
            >
              <Text
                variant={TextVariant.Caption}
                color={STATUS_COLOR[status.state]}
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {status.state === "invalid"
                  ? status.message
                  : status.state === "valid"
                    ? "Ready to apply"
                    : 'Start with a field — F("…") then a dot'}
              </Text>
            </Tooltip>
          </Stack>
        )}
      </Stack>

      <div
        style={{
          position: "relative",
          // The box below swallows no events while disabled, so the cursor
          // that says so lives here — the same one every voodo control shows
          cursor: disabled ? "not-allowed" : undefined,
        }}
      >
        <div
          style={{
            position: "relative",
            height: EXPRESSION_BOX_HEIGHT,
            overflow: "hidden",
            borderRadius: 4,
            // Disabled means disabled: no clicks, no caret, and the same
            // dimming every other locked control wears
            ...(disabled ? { pointerEvents: "none", opacity: 0.5 } : null),
            // Monaco's loading state paints nothing, so the box holds the
            // editor's surface color from the first frame
            background: "var(--fo-palette-background-level2)",
            border:
              status.state === "invalid"
                ? `1px solid ${ERROR_COLOR}`
                : "1px solid var(--fo-palette-primary-plainBorder)",
          }}
        >
          <Code
            height="100%"
            width="100%"
            defaultLanguage="python"
            value={value}
            onChange={(next) => onChange(next ?? "")}
            onMount={onMount}
            options={{
              readOnly: disabled,
              // Out of the tab order while disabled, like any other locked
              // control — the pointer already cannot get in
              tabIndex: disabled ? -1 : 0,
              automaticLayout: true,
              minimap: { enabled: false },
              lineNumbers: "off",
              folding: false,
              glyphMargin: false,
              lineDecorationsWidth: 4,
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineHeight: 18,
              wordWrap: "on",
              renderLineHighlight: "none",
              overviewRulerLanes: 0,
              padding: { top: 6, bottom: 6 },
              scrollbar: {
                vertical: "auto",
                horizontal: "hidden",
                verticalScrollbarSize: 8,
              },
              // This editor's suggestions come from the catalog below,
              // not from Monaco's own machinery
              quickSuggestions: false,
              suggestOnTriggerCharacters: false,
              parameterHints: { enabled: false },
              wordBasedSuggestions: "off",
            }}
          />
          {!value.trim() && (
            <Text
              variant={TextVariant.Caption}
              color={TextColor.Placeholder}
              style={{
                position: "absolute",
                left: 10,
                top: 7,
                // The click belongs to the editor underneath
                pointerEvents: "none",
              }}
            >
              {disabled ? (disabledReason ?? "") : placeholder}
            </Text>
          )}
        </div>

        {/*
          Suggestions float over whatever is below instead of holding a box
          open — they exist only while the caret has something to offer.
        */}
        {listOpen && (
          <div
            role="listbox"
            // Choosing a suggestion must not blur the editor — the list
            // would close under the pointer before the click lands
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 10001,
              maxHeight: wantsDate ? 320 : 240,
              overflowY: "auto",
              overflowX: "hidden",
              borderRadius: 4,
              border: "1px solid var(--fo-palette-primary-plainBorder)",
              background: "var(--fo-palette-background-level2)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            }}
          >
            {wantsDate && (
              // The caret wants a date, so offer one the way a person picks
              // one — inserted as `datetime(y, m, d)` at the caret
              <div style={{ padding: 6 }}>
                <DatePicker inline onChange={chooseDate} />
              </div>
            )}
            {fieldMatches.length > 0
              ? fieldMatches.slice(0, 24).map((path, i) => (
                  <Row
                    key={path}
                    id={`${SUGGESTION_ID}-${i}`}
                    active={i === active}
                    onChoose={() => chooseField(path)}
                  >
                    {path}
                  </Row>
                ))
              : suggestions.map(({ operator, applicable, reason }, i) => (
                  <Suggestion
                    key={operator.name}
                    id={`${SUGGESTION_ID}-${i}`}
                    active={i === active}
                    operator={operator}
                    applicable={applicable}
                    reason={reason}
                    onChoose={() => choose(operator)}
                  />
                ))}
          </div>
        )}
      </div>
    </Stack>
  );
};

const Signature: React.FC<{
  operator: Operator;
  argIndex: number;
  argKind: Kind;
}> = ({ operator, argIndex, argKind }) => (
  // One line, always: the header is a fixed height, so a long summary — an
  // `if_else` signature, say — ellipses instead of wrapping the box taller.
  // Every ancestor of the truncating text has to be allowed to shrink, or the
  // row grows to fit the text instead of clipping it.
  <Stack
    orientation={Orientation.Row}
    spacing={Spacing.Xs}
    style={{
      alignItems: "center",
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      whiteSpace: "nowrap",
    }}
  >
    <Text
      variant={TextVariant.Caption}
      color={TextColor.Secondary}
      style={{ whiteSpace: "nowrap", flexShrink: 0 }}
    >
      {operator.display}(arg {argIndex + 1})
    </Text>
    <div style={{ flexShrink: 0, display: "inline-flex" }}>
      <Pill size={Size.Xs}>{KIND_LABEL[argKind]}</Pill>
    </div>
    <Tooltip
      anchor={Anchor.Bottom}
      content={operator.summary}
      style={{ minWidth: 0, overflow: "hidden" }}
    >
      <Text
        variant={TextVariant.Caption}
        color={TextColor.Muted}
        style={{
          display: "block",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {operator.summary}
      </Text>
    </Tooltip>
  </Stack>
);

/**
 * One line, one thing to pick.
 *
 * `MenuTextItem` is the design system's compact row but it is a headlessui
 * menu item and throws without a `Menu` above it, which an always-open list
 * inside a popover has no reason to be. `Clickable` carries the affordance and
 * the text component carries the type, so the row stays a row.
 */
const Row: React.FC<
  React.PropsWithChildren<{
    onChoose?: () => void;
    muted?: boolean;
    /** The arrow keys have landed here; Enter takes it. */
    active?: boolean;
    id?: string;
  }>
> = ({ onChoose, muted, active, id, children }) => (
  // The list only scrolls to follow the keyboard, so the row identifies
  // itself and the editor decides when to bring it into view — scrolling on
  // every render would drag the list back under the pointer.
  // mousedown must not steal Monaco's focus: the list is gated on `focused`,
  // so a focus-stealing click would apply the completion and then leave the
  // follow-up suggestions (the operators a completed field invites) closed
  <div id={id} onMouseDown={(e) => e.preventDefault()}>
    <Clickable
      onClick={onChoose}
      role="option"
      aria-selected={Boolean(active)}
      aria-disabled={!onChoose}
      style={{
        display: "block",
        padding: "3px 6px",
        borderRadius: 3,
        opacity: onChoose ? 1 : 0.6,
        cursor: onChoose ? "pointer" : "not-allowed",
        background: active ? "var(--fo-palette-background-level1)" : undefined,
      }}
    >
      <Text
        variant={TextVariant.Sm}
        color={muted ? TextColor.Muted : TextColor.Primary}
      >
        {children}
      </Text>
    </Clickable>
  </div>
);

/**
 * An operator that does not apply is offered anyway, carrying its reason —
 * hiding it is only legible to someone who already knows the type system.
 */
const Suggestion: React.FC<{
  operator: Operator;
  applicable: boolean;
  reason?: string;
  onChoose: () => void;
  /** The arrow keys have landed here; Enter takes it. */
  active?: boolean;
  id?: string;
}> = ({ operator, applicable, reason, onChoose, active, id }) => {
  const row = (
    <Row
      id={id}
      onChoose={applicable ? onChoose : undefined}
      muted={!applicable}
      active={active}
    >
      {operator.display}
    </Row>
  );

  // Every operator explains itself on hover — its docstring summary from the
  // catalog, or the reason it does not apply here
  return (
    <Tooltip content={reason ?? operator.summary} anchor={Anchor.Right}>
      {row}
    </Tooltip>
  );
};

export default ExpressionEditor;
