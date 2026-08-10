# Annotation keybinding baseline

**Purpose.** P2 moves the annotation shortcuts from a global numeric priority
ladder onto scope depth plus the dismissal stack. That is a change of
*resolution model*, not of intent, so the migration is only correct if every key
in every state picks the same winner afterwards as before.

This file is the record of what the current behavior is, derived from source. It
exists because the design doc asks for a regression baseline before the ladder
moves, and because the ordering below is load-bearing and was never written
down anywhere — it lives in four magic numbers and a set of enablement
predicates spread over three files.

**Status of each row is marked:**

- `derived` — read out of the source; the resolution is unambiguous from the
  code alone.
- `CONFIRM` — needs a human in the running app, because the state combination
  depends on runtime conditions the source doesn't settle.

Sources:
`looker-3d/src/annotation/annotation-toolbar/useAnnotationActions.tsx`,
`core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationActions.tsx`,
`core/src/components/Modal/Sidebar/Annotate/Edit/useDelete.ts`.

---

## 1. The current model

All annotation bindings register in one context, `fo.modal.annotate`, on the
legacy bus. Resolution is:

1. every binding whose sequence matches the key,
2. filtered by `enablement()`,
3. ordered by `priority` descending — a **single global axis**,
4. first one wins.

Four priority constants carry the whole thing:

| Constant | Value | Used for |
| --- | --- | --- |
| `ACTIVE_ESCAPE_SHORTCUT_PRIORITY` | 300 | Cancel in-progress segment / cuboid |
| `SELECTED_VERTEX_ESCAPE_SHORTCUT_PRIORITY` | 200 | Deselect a polyline vertex |
| `EXIT_EDIT_ESCAPE_SHORTCUT_PRIORITY` | 100 | Exit edit mode and deselect |
| `TRANSFORM_SHORTCUT_PRIORITY` | 100 | `t` / `s` / `r` gizmos, `c` cuboid mode |

Note that the transform keys and exit-edit share the value 100. They never
collide because they are different keys, but it means the number carries no
ordering information between them — which is the argument for replacing the
axis rather than porting the numbers.

---

## 2. Escape ladder

The single most important sequence to preserve. Each rung is a separate binding
on `escape`, distinguished only by priority and enablement.

| # | Priority | Command | Fires when | Effect |
| --- | --- | --- | --- | --- |
| 1 | 300 | `escape.cancel-segment` | `isPolylineAnnotateActive && isActivelySegmenting` | Cancels the in-progress polyline |
| 1 | 300 | `escape.cancel-cuboid-create` | `isCuboidAnnotateActive && isCreatingCuboid` | Cancels the in-progress cuboid |
| 2 | 200 | `escape.clear-selected-vertex` | a polyline vertex is selected | Deselects the vertex |
| 3 | 100 | `escape.exit-edit-mode` | `canExitEditModeWithEscape` | Exits edit mode, deselects the label |
| 4 | — | segmentation `close` | `segmentationModeActive` | Closes open label, then tool, then segmentation mode |
| 5 | — | *(outside annotation)* | — | Falls through to the ~19 other Escape handlers |

Rungs 1 and 1 are mutually exclusive in practice — you cannot be mid-polyline
and mid-cuboid — so the shared priority is safe.

**Press-count expectations, mid-polyline with a vertex selected, in edit mode,
inside the modal.** This is the sequence the migration must reproduce exactly:

| Press | Expected |
| --- | --- |
| 1 | Cancels the in-progress polyline (rung 1) |
| 2 | Deselects the vertex (rung 2) |
| 3 | Exits edit mode and deselects the label (rung 3) |
| 4 | `CONFIRM` — segmentation close, if segmentation mode is active |
| 5 | `CONFIRM` — closes the modal, returning to the grid |

Presses 4–5 are `CONFIRM` because whether segmentation mode is active in a 3D
polyline flow, and whether the modal's own Escape then fires in the same press,
depend on runtime state the source doesn't settle. **Record the real count.**

> Under the new model this ladder becomes a dismissal stack ordered by scope
> depth: rungs 1–3 are dismissers in `modal.annotate.3d`, rung 4 in
> `modal.annotate.segmentation`, rung 5 in `modal`. Depth reproduces
> 300 > 200 > 100 *only if* the three rungs are pushed as separate layers in
> that order within one scope, since they share a scope and therefore fall
> through to push order. **This is the single riskiest detail in P2.**

---

## 3. Transform keys — `t` / `s` / `r`

Each sits at priority 100 in `fo.modal.annotate` and is enabled by
`canUseTransformShortcut(mode)`, which requires a selected transform archetype
that supports that mode.

| Key | With a transform target | Without |
| --- | --- | --- |
| `t` | Translate gizmo | Falls through to 3D **top view** |
| `s` | Scale gizmo | Falls through to modal **toggle sidebar** |
| `r` | Rotate gizmo | Falls through to **Leva panel** toggle (3D) / reset zoom (2D) |
| `c` | Cuboid create mode (`isCuboidAnnotateActive`) | Falls through to **toggle controls** |

`CONFIRM` for `r`: the 2D-vs-3D fall-through target depends on which looker is
mounted, and both are registered.

> Under the new model the fall-through is structural: the gizmo binding lives in
> `modal.annotate.3d`, the viewer binding in `modal.3d` or `modal`. A deeper
> scope whose `enablement()` fails yields to the shallower one automatically, so
> the numbers disappear. `use-camera-views.ts` already keeps its
> `!shouldReserveTForTransform` predicate for exactly this reason.

---

## 4. Segmentation toolbar

Bindings are generated from the toolbar's own `shortcut` fields, so the button
and the key cannot drift. All are gated on
`segmentationModeActive && !action.isDisabled`, at default priority.

| Key | Action | Group |
| --- | --- | --- |
| `v` | Select tool | Tool |
| `b` | Brush tool | Tool |
| `p` | Pen tool | Tool |
| `a` | AI tool | Tool |
| `m` | Merge tool | Tool — `CONFIRM` disabled state (`mergeTool.disabled`) |
| `d` | Add to mask | Mode |
| `e` | Remove from mask | Mode |
| `[` | Decrease brush size | Size |
| `]` | Increase brush size | Size |
| `s` | Toggle brush shape (circle / square) | Shape |
| `escape` | Close open label → tool → segmentation mode | Close |

**`CONFIRM` — what each does when it is *not* applicable.** The source shows
they are gated by `enablement`, so they should fall through to the same key's
meaning outside segmentation (`s` → sidebar, `p` → preferences, `b` → 3D
background, `e` → ego view). Verify each, because a predicate that returns true
too eagerly is invisible until someone hits the other binding.

**`CONFIRM` — `[` and `]` held.** These are the migration's repeat-semantics
case. The legacy bus drops `event.repeat` globally, so **holding `[` today
should step the brush size exactly once.** Under the new model they are declared
`repeatable: true` and will step continuously. Confirm the current behavior
before changing it — if holding already repeats, something other than the bus
is handling it.

**`CONFIRM` — three-way `s`.** `s` is brush shape here, scale gizmo in
`modal.annotate.3d`, and sidebar toggle in `modal`. Record which wins with:
segmentation active + no transform target; segmentation active + transform
target; neither.

---

## 5. Delete

| Key | Command | Enablement |
| --- | --- | --- |
| `Delete`, `Backspace` | `ModalDeleteAnnotation` (`useDelete.ts`) | a label is selected for annotation |

`useDelete.ts` carries the comment *"handled in useAnnotationActions.tsx,
reconcile"*, and the audit found four other Delete handlers
(`useAnnotationActions`, `SegmentPolylineRenderer`, lighter's
`InteractionManager`, ViewBar).

**`CONFIRM` — the duplicate.** Establish whether deleting a label today fires
one handler or several. This is the one row where the baseline may record a
*bug* rather than behavior to preserve, and P2 should not faithfully reproduce
a double-delete.

---

## 6. How to use this

1. Walk sections 2–5 in the running app and fill in every `CONFIRM`, correcting
   any `derived` row that turns out to be wrong. Commit that as the baseline.
2. `keymap.test.ts` ▸ `describe("annotation ladder (P2 baseline)")` encodes the
   `derived` rows as executable tests against the **new** model, so the
   migration can be checked before the annotation code is touched at all. They
   pass today, which means the new precedence model is capable of expressing the
   old order — necessary, not sufficient.
3. Migrate. The tests should still pass, and the manual walk should produce
   identical press counts.
