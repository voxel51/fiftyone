# @fiftyone/view-bar

The row of stage cards above the grid. Each card is one view stage; the bar
serializes them all and pushes them through `fos.useSetView`.

## The one idea

**The server describes the stages; the bar renders the description.** Nothing
here knows that `FilterLabels` takes a label field or that `ToClips` needs
video. `fiftyone/core/stages.py` says so,
`fiftyone/server/stage_definitions.py` serves it, and this package reads it. A
stage added in Python appears in the bar with the right controls and the right
constraints, without a line changing here.

The corollary is the rule for changes: when the bar needs to know something new
about a stage, the answer is almost always a new field on the descriptor, not a
table keyed by stage name. There used to be such a table on the server;
collapsing it into the stages is what made the rest of this possible.

## Expressions

`to_mongo()` is a one-way lowering. `F("conf") > 0.5` and `F("conf").exists()`
become MongoDB that cannot be turned back into Python — `&` and `.all()` lower
identically, and twenty operators lower to idioms. So an expression the user
wrote could be applied but never reopened.

The fix is that a stage serializes its expressions **twice**: as the lowered
MongoDB its pipeline runs, and as an _envelope_ recording the syntax they were
written in. The envelope travels beside `kwargs`, under `_expr_asts`, not
inside it — an older client reads only `_cls`/`kwargs`/`_uuid` and ignores the
fourth key, where an envelope placed in `kwargs` would reach the stage
constructor and build a broken pipeline.

- `expression/parse.ts` — Python source → tree. Quotes inside `F(...)` are
  optional; the printer always writes them, so what leaves is canonical.
- `expression/print.ts` — tree → source. Exactly the inverse.
- `builder/envelope.ts` — tree ↔ the wire format the server decodes.

Because parse and print are inverses, the source text is the only
representation. There is no builder model beside it, so there is nothing to
fall out of sync and no "you may lose part of your expression" dialog to write.
**Do not add a builder/code toggle.**

## Suggestions

`builder/suggest.ts` reads context from the **text at the caret**, not from the
parse: the expression left of a trailing dot, the call whose parentheses are
still open, the path being typed inside `F(`. A half-typed expression does not
parse, and that is exactly when suggestions are worth having.

Operators that do not apply to the value at the caret are ranked last **and
kept visible with the reason** — `contains needs STRING, this is NUMBER`.
Hiding them is only legible to someone who already knows the type system.

An expression is scoped to the field above it: `FilterLabels("predictions", …)`
applies its filter to each detection, so the suggestions are the detection's
own fields and the user writes `F("label")`, not the full path (`fields.ts`).

## Layout heuristics

These regressed repeatedly by eye, so they are rules in `layout.test.ts` now.
Change the test deliberately or not at all.

| Rule                                              | Why                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| One popover width for every stage                 | Sizing to content made it jump between editors and gave two stages holding the same parameter two different shapes |
| Tall controls place their own switcher            | A tab column beside a 104px editor is mostly dead space; their content spans the full width instead                |
| Toggles last, sharing one row                     | They are options on the thing being described, not part of describing it                                           |
| Private parameters are hidden, still serialized   | `_state` and `_randint` are the stage's own plumbing — but dropping them changes what the stage does               |
| Every reserved line stays reserved                | An arriving error must move nothing                                                                                |
| A parameter waits for the required ones before it | A filter written against no field is written against nothing                                                       |

## Editors

A parameter's `type` is pipe-delimited alternatives, but alternatives that mean
the same thing do not each get an editor. A field parameter's `str` exists only
because Python accepts a path as a plain string, and a list alternative
subsumes its singular. The exception is a parameter naming a field the stage
_writes_, where typing a name the dataset does not have yet is a genuinely
different act — the server's `existence` axis is what distinguishes them.

## Conventions

- **Use the design system.** `@voxel51/voodo` —
  `Text`/`TextVariant`/`TextColor` rather than hand-picked colours, so both
  themes work. Two gaps are worked around at the call site with a comment
  naming the fix: `Input` does not forward a ref (the caret needs
  `selectionStart`) and `Select` takes no placeholder. `MenuTextItem` is a
  headlessui menu item and throws outside a `Menu` — use `Clickable` for
  always-open lists.
- **No new `useRecoilValue` call sites.** State goes through accessor hooks in
  `@fiftyone/state` (`useFieldTypes`, `useDatasetMediaType`).
- **The pure rules are exported and tested** — `paramModes`, `rows`,
  `appliesTo`, `expressionScope`, `statusOf`, `scopedTo`. Anything decided by
  eye in a component is a thing that will regress.

## Known gaps

- The operator catalog in `builder/catalog.ts` is a stub. The real
  `viewExpressionOperators` query is served and unwired, so kind filtering is
  inert — every field reads as `ANY` and nothing is ranked down yet.
- Suggestions are click-only; no arrow-key navigation.
