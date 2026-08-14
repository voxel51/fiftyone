/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What a stage's descriptors mean.
 *
 * The server describes every stage and parameter — the alternatives a value may
 * take, whether it is required, the fields it accepts, the media types the
 * stage applies to. Reading those descriptions is a set of rules, and they live
 * here rather than inside the bar so each can be stated once and tested
 * directly, instead of being inferred from whatever the popover renders.
 */

import { fromSource, isEnvelope, sourceOf } from "./builder/envelope";

/**
 * Highest-priority input "kind" for a stage parameter, derived from
 * the param's pipe-delimited `type` string. We prefer the most
 * specific UI we can offer for any alternative the param accepts —
 * `"field|str"` becomes a field picker (server still receives a
 * string), `"list<field>|field"` becomes a multi-select field
 * picker, etc.
 *
 * Order matters: pickers further down in the precedence table
 * lose to the ones above when both apply.
 */
export type InputKind =
  | "bool"
  | "field"
  | "fieldList"
  | "numeric"
  | "string"
  | "stringList"
  | "json"
  | "python"
  | "id"
  | "idList"
  | "select";

/**
 * Every control a param can legitimately be edited with, most specific first.
 *
 * A param accepting more than one genuinely different thing gets one mode each:
 * `SortBy.field_or_expr` is `field|str|json`, a field path *or* an expression,
 * and collapsing that to a single winner is what made expressions unreachable in
 * `SortBy`, `GroupBy` and `ToClips`.
 *
 * Alternatives that are the same thing spelled differently do not. A field
 * param's `str` exists because Python accepts a field path as a plain string, so
 * a text mode beside the picker would send the identical value — the exception
 * is a param naming a field the stage writes, where typing a name the dataset
 * does not have yet is a different act and the picker has nothing to offer. A
 * list alternative likewise subsumes its singular, since the multi-select can
 * hold one item and Python takes either.
 */
export const paramModes = (param: ParamDef): InputKind[] => {
  const has = (t: string) => param.tokens.includes(t);
  // `expr` marks a param a ViewExpression satisfies, so the expression editor
  // leads and the raw editor stays behind it showing the lowering. `json` and
  // `dict` are plain data — `Mongo.pipeline` a pipeline, `MapLabels.map` a
  // lookup table — where an expression is not an answer, so they get the raw
  // editor alone.
  const expression: InputKind[] = has("expr")
    ? ["python", "json"]
    : has("json") || has("dict")
      ? ["json"]
      : [];

  // A closed set of valid values — constants from the stage itself, or names
  // the App resolves from the dataset — is a picker, not a text box
  if (RESOLVED_CHOICES.has(param.choices.source)) {
    return ["select"];
  }

  if (param.choices.source === "FIELDS") {
    const picker: InputKind = has("list<field>") ? "fieldList" : "field";
    const newNames = param.choices.fields.some(
      (constraint) => constraint.existence !== "EXISTING",
    );
    const typed: InputKind[] = newNames ? ["string"] : [];
    return [picker, ...typed, ...expression];
  }

  const modes: InputKind[] = [];
  if (has("bool")) modes.push("bool");
  if (has("int") || has("float")) modes.push("numeric");
  if (has("list<id>")) modes.push("idList");
  else if (has("id")) modes.push("id");
  if (has("list<str>")) modes.push("stringList");
  else if (has("str")) modes.push("string");
  modes.push(...expression);

  // `json` is also the catch-all for a type this build doesn't recognize.
  return modes.length ? modes : ["json"];
};

export const pickInput = (param: ParamDef): InputKind => paramModes(param)[0];

/** The choice sources whose values arrive as a list to pick from. */
export const RESOLVED_CHOICES: ReadonlySet<ParamChoices["source"]> = new Set([
  "CONSTANTS",
  "GROUP_SLICES",
  "EVALUATION_KEYS",
] as const);

/** Short label for a mode, for the switcher. */
export const MODE_LABELS: Record<InputKind, string> = {
  bool: "bool",
  field: "field",
  fieldList: "fields",
  numeric: "number",
  string: "text",
  stringList: "list",
  id: "id",
  idList: "ids",
  json: "json",
  python: "expr",
  select: "pick",
};

/**
 * Which mode a value already in the view belongs to, so a hydrated stage opens
 * in the editor that matches what is actually there rather than in whichever
 * mode happens to be first.
 */
export const inferMode = (
  param: ParamDef,
  value: unknown,
  isFieldPath: (path: string) => boolean,
): InputKind => {
  const modes = paramModes(param);
  const allows = (kind: InputKind) => modes.includes(kind);

  if (value === undefined || value === null || value === "") {
    return modes[0];
  }

  // An envelope carries the syntax the expression was written in, so it opens
  // in the editor that can show it
  if (isEnvelope(value) && allows("python")) {
    return "python";
  }

  // An operator-keyed object or a nested array is an expression, never a field
  if (typeof value === "object" && !Array.isArray(value) && allows("json")) {
    return "json";
  }

  if (Array.isArray(value)) {
    if (value.some((v) => typeof v === "object" && v !== null)) {
      if (allows("json")) return "json";
    }
    if (allows("fieldList") && value.every((v) => typeof v === "string")) {
      const paths = value as string[];
      if (paths.every(isFieldPath)) return "fieldList";
    }
    if (allows("idList")) return "idList";
    if (allows("stringList")) return "stringList";
    if (allows("json")) return "json";
    return modes[0];
  }

  if (typeof value === "boolean" && allows("bool")) return "bool";

  if (typeof value === "number" && allows("numeric")) return "numeric";

  if (typeof value === "string") {
    if (allows("field") && isFieldPath(value)) return "field";
    if (allows("fieldList") && isFieldPath(value)) return "fieldList";
    if (
      allows("numeric") &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    )
      return "numeric";
    if (allows("string")) return "string";
    if (allows("id")) return "id";
  }

  return modes[0];
};

/** `true` when a kwarg carries nothing the server should receive. */
export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * The reason this value cannot be sent, or null when it can.
 *
 * Numbers are checked strictly: `Number` rejects trailing garbage where
 * `parseFloat` would quietly accept `"1x"` as 1, and a param that takes `int`
 * without `float` rejects a fractional value. Expressions and dicts are only
 * checked for being parseable — the server is the authority on their contents.
 */
export const validateParam = (
  param: ParamDef,
  value: unknown,
  kind: InputKind,
): string | null => {
  if (isEmptyValue(value)) {
    return param.required ? "Required" : null;
  }

  if (kind === "numeric") {
    const text = String(value).trim();
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      return `Not a number: ${text}`;
    }
    if (!param.tokens.includes("float") && !Number.isInteger(parsed)) {
      return "Must be a whole number";
    }
  }

  // An envelope under the json editor is an expression being displayed as
  // its lowering, not text to parse
  if (kind === "json" && typeof value === "string" && !isEnvelope(value)) {
    try {
      JSON.parse(value);
    } catch (e) {
      return `Invalid JSON: ${(e as Error).message}`;
    }
  }

  if (kind === "python") {
    const source = sourceOf(value);
    if (source === null) {
      return "This expression was not written here, so it cannot be edited as Python";
    }

    const result = fromSource(source);
    if (result.status === "error") {
      return result.message;
    }
  }

  return null;
};

/**
 * One way a field param can be satisfied, as the stage declares it. `ftypes`
 * and `labelTypes` are empty when unrestricted; `existence` says whether a name
 * the dataset does not have yet is acceptable, which it is for a param naming a
 * field the stage writes.
 */
export interface FieldConstraint {
  level: "ANY" | "SAMPLE" | "FRAME" | "%future added value";
  existence: "EXISTING" | "EXISTING_ROOT" | "ANY" | "%future added value";
  ftypes: readonly string[];
  labelTypes: readonly string[];
}

/** Where a param's valid values come from, discriminated by `source`. */
export interface ParamChoices {
  source:
    | "FIELDS"
    | "GROUP_SLICES"
    | "CONSTANTS"
    | "EVALUATION_KEYS"
    | "FREE_TEXT"
    | "%future added value";
  fields: readonly FieldConstraint[];
  values: readonly string[];
}

export interface ParamDef {
  name: string;
  /** Withheld from the form by the surface's capabilities; still serialized. */
  hidden?: boolean;
  type: string;
  /** `type`'s alternatives, already split by the server. */
  tokens: readonly string[];
  nullable: boolean;
  required: boolean;
  choices: ParamChoices;
  default: string | null | undefined;
  placeholder: string | null | undefined;
}

/**
 * What the embedding surface allows the bar to offer. OSS offers everything;
 * a host that meters who may create indexes or fields passes its own answer.
 */
export interface ViewBarCapabilities {
  /** May toggle `create_index` where a stage offers it. */
  createIndexes: boolean;
  /** May name a field the stage will create. */
  createFields: boolean;
}

export const OPEN_CAPABILITIES: ViewBarCapabilities = {
  createIndexes: true,
  createFields: true,
};

/**
 * The stage definitions as the capabilities allow them, rewritten once so
 * everything downstream — pickers, modes, validation, blocking — follows
 * without ever consulting capabilities again. Hiding a `create_index`
 * param removes its toggle while leaving any value it already carries
 * untouched; tightening a constraint to `EXISTING` turns a
 * name-a-new-field control into a picker over fields the dataset
 * already has.
 */
export const gateDefinitions = (
  defs: readonly StageDefinition[],
  capabilities: ViewBarCapabilities,
): StageDefinition[] => {
  if (capabilities.createIndexes && capabilities.createFields) {
    return [...defs];
  }

  return defs.map((def) => ({
    ...def,
    params: def.params
      .map((param) =>
        // Hidden, not dropped: a view built by someone who could create the
        // index re-applies here with that choice intact
        capabilities.createIndexes || param.name !== "create_index"
          ? param
          : { ...param, hidden: true },
      )
      .map((param) => {
        if (
          capabilities.createFields ||
          param.choices.source !== "FIELDS" ||
          param.choices.fields.every(
            (constraint) => constraint.existence === "EXISTING",
          )
        ) {
          return param;
        }
        return {
          ...param,
          choices: {
            ...param.choices,
            fields: param.choices.fields.map((constraint) => ({
              ...constraint,
              existence: "EXISTING" as const,
            })),
          },
        };
      }),
  }));
};

/**
 * The required parameter this one is waiting on, if any.
 *
 * Parameters are declared in the order the stage's constructor takes them, and
 * an expression is written against the earlier ones: a `FilterLabels` filter
 * has nothing to filter until a field is chosen, so rather than let someone
 * write an expression against nothing, it waits. Only expressions wait —
 * a toggle like `only_matches` means the same thing whatever else is chosen.
 */
export const blockedBy = (
  param: ParamDef,
  params: ParamDef[],
  kwargs: Record<string, unknown>,
): string | null => {
  if (!paramModes(param).includes("python")) return null;

  for (const earlier of params) {
    if (earlier.name === param.name) return null;
    if (isPrivate(earlier)) continue;
    if (earlier.required && isEmptyValue(kwargs[earlier.name])) {
      return earlier.name;
    }
  }

  return null;
};

/**
 * What a freshly added stage starts out holding.
 *
 * A parameter's default is the Python repr the stage declares — across every
 * stage that is only `True`, `False` or `None`. A boolean one is seeded so the
 * toggle opens showing what the stage will actually do, rather than showing
 * `false` and silently becoming `true` on apply.
 */
export const defaultKwargs = (params: ParamDef[]): Record<string, unknown> => {
  const kwargs: Record<string, unknown> = {};

  for (const param of params) {
    if (param.default === "True") kwargs[param.name] = true;
    else if (param.default === "False") kwargs[param.name] = false;
  }

  return kwargs;
};

/**
 * Whether a stage can be applied to a collection of this media type.
 *
 * A stage that declares no media types applies to anything. The group stages
 * declare `group`, which is what a group dataset reports — a dynamic group is a
 * view over some other media type and does not, which is correct: its slices
 * are not group slices.
 */
export const appliesTo = (
  definition: { mediaTypes: readonly string[] },
  mediaType: string | null,
): boolean =>
  definition.mediaTypes.length === 0 ||
  (mediaType !== null && definition.mediaTypes.includes(mediaType));

/**
 * The field an expression parameter is evaluated against, or null for the
 * sample itself.
 *
 * `FilterLabels("detections", F("label") == "cat")` applies its filter to each
 * detection, so the expression names the detection's fields. That is true of
 * any expression declared after a field parameter on the same stage — the field
 * is what the stage narrowed to before the expression runs. `Match`, whose
 * filter is the stage's first parameter, has no such field and reads the sample.
 */
export const expressionScope = (
  param: ParamDef,
  params: ParamDef[],
  kwargs: Record<string, unknown>,
): string | null => {
  for (const earlier of params) {
    if (earlier.name === param.name) break;
    if (isPrivate(earlier)) continue;

    const value = kwargs[earlier.name];
    if (earlier.choices.source === "FIELDS" && typeof value === "string") {
      return value;
    }
  }

  return null;
};

/**
 * Server-owned parameters, by the leading underscore Python marks them with:
 * `Take._randint`, `ToPatches._state`, `SetField._allow_missing`. They are
 * plumbing the stage keeps for itself, so the form does not show them — but
 * they are still serialized, because dropping one changes what the stage does.
 */
export const isPrivate = (param: ParamDef): boolean =>
  Boolean(param.hidden) || param.name.startsWith("_");

/** `only_matches` is how Python spells it; "only matches" is how it reads. */
export const humanize = (name: string): string =>
  name.replace(/^_+/, "").replace(/_/g, " ");

/**
 * Controls with a tall region — a suggestion list, an editor — take the
 * switcher and place it against their own content, so that content spans the
 * full width instead of starting past a column of tabs.
 */
export const PLACES_ITS_OWN_TABS: ReadonlySet<InputKind> = new Set<InputKind>([
  "python",
  "json",
]);

/**
 * The colour an unappliable value wears.
 *
 * `--fo-palette-error-*` exists as `main`; the `plainColor` shade the rest of
 * the chrome uses for primary has no error counterpart, and a var that
 * resolves to nothing silently leaves the element with its default border —
 * which is how an invalid stage came to look fine. The literal is the same
 * red, for any surface that renders outside the theme provider.
 */
export const ERROR_COLOR = "var(--fo-palette-error-main, hsl(0, 87%, 53%))";

/**
 * Spread into every text input: the bar brings its own suggestions, and the
 * browser's autofill dropdown painted over them is two lists fighting for one
 * input.
 */
export const NO_BROWSER_SUGGESTIONS = {
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const;

/**
 * Both expression editors are exactly this tall, and their header rows exactly
 * `EDITOR_HEADER_HEIGHT` — flipping between expr and json must move nothing.
 */
export const EXPRESSION_BOX_HEIGHT = 104;
export const EDITOR_HEADER_HEIGHT = 24;

/**
 * Kinds that get no reserved status line: one reports its own reason, and a
 * toggle has no invalid state to report, so the line would only be dead space.
 */
export const NO_STATUS_LINE: ReadonlySet<InputKind> = new Set<InputKind>([
  "python",
  "json",
  "bool",
]);

/** A stage as the server describes it. */
export interface StageDefinition {
  name: string;
  /** What the stage does — its docstring's opening sentence. */
  description?: string | null;
  /** The media types it applies to; empty means any. */
  mediaTypes: readonly string[];
  params: ParamDef[];
}

/**
 * Groups the params into rows.
 *
 * Toggles go last whatever order the stage declares them in — they are options
 * on the thing being described rather than part of describing it — and they
 * share a row, because a switch and its label do not need a line each.
 * Everything else keeps declaration order and gets the full width.
 */
export const rows = (
  params: ParamDef[],
  kindOfParam: (param: ParamDef) => InputKind,
): ParamDef[][] => {
  const toggles = params.filter((param) => kindOfParam(param) === "bool");
  const rest = params.filter((param) => kindOfParam(param) !== "bool");

  return [
    ...rest.map((param) => [param]),
    ...(toggles.length ? [toggles] : []),
  ];
};
