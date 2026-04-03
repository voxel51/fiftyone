# Hackday: Redux Toolkit in FiftyOne Annotation

**Date:** 2026-04-02 — 2026-04-03
**Scope:** Annotation sidebar (`app/packages/core/src/components/Modal/Sidebar/Annotate/`)

## What we did

Installed Redux Toolkit alongside the existing Jotai/Recoil/Relay stack and
**fully migrated** the Annotation feature's core state management to Redux.
The Jotai→Redux bridge that powered the initial migration was subsequently
deleted; Redux is now the sole source of truth for annotation state.

### Migration phases

1. **RTK Query proof-of-concept** — fetched app info, datasets, and sample
   data via RTK Query alongside the existing Relay/Recoil stack
2. **Redux slice + bridge** — mirrored Jotai state into Redux via a
   `useEffect`-based bridge; components read from Redux
3. **Dual-write hooks** — components dispatched to Redux AND wrote to Jotai
4. **Overlay isolation** — added `overlayId` to `AnnotationLabel`, created
   `useOverlayById` hook in Lighter, replaced all `label.overlay.id` with
   `label.overlayId`
5. **Cold turkey** — deleted the bridge, made Redux the sole write target,
   removed all Jotai dual-writes
6. **Derived selectors** — replaced Jotai derived atoms with `createSelector`
7. **Full sweep** — migrated all remaining UI atoms (loading state, expanded
   toggles, counts, QuickDraw, hover, delete confirmation, context manager,
   schema resolver, primitives, field validation cache)

### Stack

- **RTK Query** — fetches from `/fiftyone` (REST) and `/graphql` (GraphQL)
- **Redux slice** (`annotationSlice.ts`) — all annotation state (~30 fields)
- **`createSelector`** — 15+ derived selectors replacing Jotai derived atoms
- **Redux hooks** (`hooks.ts`) — 40+ typed hooks for reads and writes
- **`useOverlayById`** — Lighter hook for resolving overlay IDs at render time

### Final migration scorecard

| State | Redux | Jotai | Notes |
|---|---|---|---|
| `isAnnotating` | Slice | Dead | — |
| `editingLabel` | Slice | Dead | Fully serializable with `overlayId` |
| `isNewLabel` | Slice | Dead | — |
| `labels` | Slice | Dead export | `useLabels.ts` exports atom for `looker-3d` compat |
| `activeSchemas` | Slice | Dead | — |
| `labelSchemasData` | Slice | Dead | Written directly by `useLoadSchemas` |
| `exploreActiveFields` | Slice | Dead | Written directly by `Sidebar.tsx` |
| `schemaTab` | Slice | Dead | — |
| `labelsLoadingState` | Slice | Dead | — |
| `labelsExpanded` | Slice | Dead | — |
| `primitivesExpanded` | Slice | Dead | — |
| `labelsCount` / `primitivesCount` | Slice | Dead | — |
| `activePrimitive` | Slice | Dead | — |
| `quickDrawActive` | Slice | Dead | — |
| `lastUsedField` / `lastUsedLabels` | Slice | Dead | — |
| `savedLabelData` | Slice | Dead | — |
| `schemaManagerDisplayed` | Slice | Dead | — |
| `schemaManagerField` | Slice | Dead | — |
| `activeLabelId` | Slice | Dead | — |
| `showDeleteConfirmation` | Slice | Dead | — |
| `askForDeleteConfirmation` | Slice | Dead | With localStorage sync |
| `hoveredLabelId` | Slice | Dead | `useHover.ts` fully rewritten |
| `visibleLabelSchemas` | `createSelector` | Dead | — |
| `inactiveLabelSchemas` | `createSelector` | Dead | — |
| `fieldType(path)` | `createSelector` | Dead | — |
| `fieldTypes` | `createSelector` | Dead | — |
| `fieldsOfType(type)` | `createSelector` | Dead | — |
| `defaultField(type)` | `createSelector` | Dead | — |
| `currentType` | `createSelector` | Dead | — |
| `currentField` | `createSelector` | Dead | — |
| `currentFieldIsReadOnly` | `createSelector` | Dead | — |
| `currentFields` | `createSelector` | Dead | — |
| `currentData` | `createSelector` | Dead | — |
| `currentOverlayId` | `createSelector` | Dead | Components use `useOverlayById` |
| `labelsByPath` | `createSelector` | Dead | — |

### What's NOT on Redux yet

| Area | Files | Jotai calls | Notes |
|---|---|---|---|
| Schema Manager modal | `SchemaManager/hooks.ts`, `state.ts`, `ActiveFieldsSection.tsx`, `useLabelSchema.ts` | ~20 | Self-contained modal; not part of core annotation flow |
| Dead atom definitions | `state.ts`, `Edit/state.ts`, `useLabels.ts` | Exports only | Kept for `index.tsx` barrel export / `looker-3d` compat |

**Everything outside the Schema Manager modal is Redux-only.**

---

## Architectural finding: overlay leakage (identified and fixed)

### The problem

`AnnotationLabel` bundled serializable data with a live overlay reference:

```ts
interface AnnotationLabel {
  path: string;           // serializable
  type: string;           // serializable
  data: AnnotationLabelData; // serializable
  overlay: BaseOverlay;   // NOT serializable — live canvas object
}
```

This prevented `editing`, `current`, `currentOverlay`, and `currentData` from
moving to Redux.

### The fix (implemented)

1. Added `overlayId: string` to the `Label` base interface (`@fiftyone/state`)
2. Made `overlay` optional (deprecated) on all `AnnotationLabel` variants
3. Created `useOverlayById(id)` hook in `@fiftyone/lighter`
4. Updated `useCreateAnnotationLabel` and `useAddAnnotationLabel3dPolyline`
   to set `overlayId`
5. Replaced every `label.overlay.id` reference with `label.overlayId`
6. Replaced every `useAtomValue(currentOverlay)` with
   `useOverlayById(useCurrentOverlayId())`
7. Rewrote `currentOverlay` Jotai atom to use `scene.getOverlay(label.overlayId)`

**Result:** State holds IDs. The scene holds objects. Components resolve at
render time. The overlay no longer leaks through the state layer.

---

## Key lessons

### The bridge pattern is fragile — go cold turkey instead

The Jotai→Redux bridge (`useEffect` / `useLayoutEffect` sync) caused:
- **One-frame stale reads** — Redux lagged behind Jotai, causing the sidebar
  to flash between states
- **Loading deadlocks** — bridge couldn't mount because it was behind a
  loading gate that read Redux (which the bridge hadn't populated yet)
- **Duplicate key warnings** — `splitAtom` regenerating atoms during the sync
  cycle produced duplicate entries
- **Canvas selection bug** — `useFocus` set Jotai `editing` directly; the
  bridge propagated the intermediate null state, closing the edit panel

**Going cold turkey (Redux writes at the source, no bridge) eliminated all of
these.**

### Provider placement matters

- Started with `<Provider>` inside `<Annotate>` — broke when hooks were used
  in `Modal.tsx` and `ModalNavigation.tsx`
- Moved `<Provider>` to wrap the entire Modal portal — fixed all access issues
- In a full migration, the Provider would go at the app root

### `createSelector` naturally replaces Jotai derived atoms

- Same memoization semantics (recompute only when inputs change)
- Parameterized selectors (`selectFieldType(path)`) replace `atomFamily`
- Composition works the same way (selectors reading other selectors)
- Visible in Redux DevTools without extra setup

### RTK Query works well with the existing backend

- REST endpoints (`/fiftyone`) work out of the box
- GraphQL queries work via a generic `POST /graphql` endpoint
- The operator RPC pattern (`useSchemaManager`) could be modeled as RTK Query
  mutations with optimistic updates

### Non-serializable objects need clear boundaries

`overlay` (canvas renderer), `contextManager` (class instance), and
`schemaManagementOps` (function callbacks) are non-serializable. Each needed
a different strategy:

| Object | Strategy |
|---|---|
| `overlay` | ID-based lookup via `useOverlayById` |
| `contextManager` | Module-level singleton |
| `schemaManagementOps` | Module-level variable with getter |

The common principle: **state holds identifiers and data; instances live
outside the store and are resolved at the boundary.**

---

## Files created

| File | Purpose |
|---|---|
| `redux/store.ts` | Redux store (RTK Query + annotation slice) |
| `redux/api.ts` | RTK Query API (REST + GraphQL endpoints) |
| `redux/annotationSlice.ts` | Slice (~30 state fields) + 15 `createSelector` derivations |
| `redux/hooks.ts` | 40+ typed hooks (reads, writes, derived selectors) |
| `redux/ReduxExperiment.tsx` | RTK Query logger (bridge deleted) |
| `lighter/src/react/useOverlayById.ts` | Overlay ID → instance resolver |

## Files modified (~35)

Core annotation flow (load → display → select → edit → delete):
`Annotate.tsx`, `LabelList.tsx`, `LabelEntry.tsx`, `Actions.tsx`,
`AnnotationSliceSelector.tsx`, `ImportSchema.tsx`, `useEntries.ts`,
`useLabels.ts`, `useLoadSchemas.ts`, `useFocus.ts`, `useHover.ts`,
`useCreateAnnotationLabel.ts`, `useAddAnnotationLabelToRenderer.ts`,
`useAddAnnotationLabel3dPolyline.ts`, `useSamplePrimitives.ts`,
`usePrimitiveEntries.ts`, `usePrimitivesCount.ts`,
`useSourceFieldToActivate.ts`, `useAnnotationContextManager.ts`,
`useSchemaResolver.ts`, `useValidAnnotationFields.ts`,
`useCanAnnotate.ts` (import only)

Edit panel:
`Edit/Edit.tsx`, `Edit/Header.tsx`, `Edit/Field.tsx`, `Edit/Position.tsx`,
`Edit/Position3d.tsx`, `Edit/Id.tsx`, `Edit/AnnotationSchema.tsx`,
`Edit/PolylineDetails.tsx`, `Edit/useExit.ts`, `Edit/useDelete.ts`,
`Edit/useCreate.ts`, `Edit/useClassification.ts`, `Edit/useQuickDraw.ts`,
`Edit/useActivePrimitive.ts`, `Edit/useColor.ts`, `Edit/AddSchema.tsx`,
`Edit/bridgeQuickDraw.ts`

Other:
`Confirmation/useConfirmDelete.tsx`, `GroupEntry.tsx`, `state.ts`,
`SchemaManager/hooks.ts`, `SchemaManager/ActiveFieldsSection.tsx`,
`Modal.tsx`, `Sidebar.tsx`,
`Sidebar/InteractiveSidebar/utils.ts`

Type changes:
`@fiftyone/state` — `Label.overlayId` added, `overlay` made optional
