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
import { EDITOR_HEADER_HEIGHT, EXPRESSION_BOX_HEIGHT } from "../params";
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
  /** Committed elsewhere — the editor never reports a parse error while typing. */
  error?: string | null;
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

  const symbolic = !/^[A-Za-z_]/.test(operator.display);
  const hasDot = source[start - 1] === ".";

  if (symbolic) {
    const from = hasDot ? start - 1 : start;
    const head = `${source.slice(0, from)} ${operator.display} `;
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
type CodeEditor = Parameters<
  NonNullable<React.ComponentProps<typeof Code>["onMount"]>
>[0];

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

export const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
  value,
  onChange,
  fields = [],
  fieldKind = () => undefined,
  // No catalog yet means no operator suggestions — never a stale local copy
  operators = [],
  placeholder = 'F("confidence") > 0.5',
  tabs,
  disabled,
  error,
}) => {
  // The caret offset is the whole basis for what gets suggested; Monaco
  // reports it through cursor events rather than DOM selection state
  const editorRef = useRef<CodeEditor | null>(null);
  const [offset, setOffset] = useState(value.length);

  const onMount = useCallback((editor: CodeEditor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (model) setOffset(model.getOffsetAt(e.position));
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
        style={{ height: EDITOR_HEADER_HEIGHT }}
      >
        {tabs}
        {signature ? (
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
            <Text
              variant={TextVariant.Caption}
              color={STATUS_COLOR[status.state]}
              title={status.state === "invalid" ? status.message : undefined}
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
          </Stack>
        )}
      </Stack>

      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "relative",
            height: EXPRESSION_BOX_HEIGHT,
            overflow: "hidden",
            borderRadius: 4,
            // Monaco's loading state paints nothing, so the box holds the
            // editor's surface color from the first frame
            background: "var(--fo-palette-background-level2)",
            border:
              status.state === "invalid"
                ? "1px solid var(--fo-palette-error-plainColor)"
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
              {placeholder}
            </Text>
          )}
        </div>

        {/*
          Suggestions float over whatever is below instead of holding a box
          open — they exist only while the caret has something to offer.
        */}
        {(fieldMatches.length > 0 || suggestions.length > 0) && (
          <div
            role="listbox"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 10001,
              maxHeight: 240,
              overflowY: "auto",
              overflowX: "hidden",
              borderRadius: 4,
              border: "1px solid var(--fo-palette-primary-plainBorder)",
              background: "var(--fo-palette-background-level2)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            }}
          >
            {fieldMatches.length > 0
              ? fieldMatches.slice(0, 24).map((path) => (
                  <Row key={path} onChoose={() => chooseField(path)}>
                    {path}
                  </Row>
                ))
              : suggestions.map(({ operator, applicable, reason }) => (
                  <Suggestion
                    key={operator.name}
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
  <Stack
    orientation={Orientation.Row}
    spacing={Spacing.Xs}
    style={{ alignItems: "center" }}
  >
    <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
      {operator.display}(arg {argIndex + 1})
    </Text>
    <Pill size={Size.Xs}>{KIND_LABEL[argKind]}</Pill>
    <Text
      variant={TextVariant.Caption}
      color={TextColor.Muted}
      title={operator.summary}
      style={{
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
      }}
    >
      {operator.summary}
    </Text>
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
  React.PropsWithChildren<{ onChoose?: () => void; muted?: boolean }>
> = ({ onChoose, muted, children }) => (
  <Clickable
    onClick={onChoose}
    role="option"
    aria-selected={false}
    aria-disabled={!onChoose}
    style={{
      display: "block",
      padding: "3px 6px",
      borderRadius: 3,
      opacity: onChoose ? 1 : 0.6,
      cursor: onChoose ? "pointer" : "not-allowed",
    }}
  >
    <Text
      variant={TextVariant.Sm}
      color={muted ? TextColor.Muted : TextColor.Primary}
    >
      {children}
    </Text>
  </Clickable>
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
}> = ({ operator, applicable, reason, onChoose }) => {
  const row = (
    <Row onChoose={applicable ? onChoose : undefined} muted={!applicable}>
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
