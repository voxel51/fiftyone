# Hackday: Redux Toolkit in FiftyOne Annotation

**Date:** 2026-04-02
**Scope:** Annotation sidebar (`app/packages/core/src/components/Modal/Sidebar/Annotate/`)

## What we did

Installed Redux Toolkit alongside the existing Jotai/Recoil/Relay stack and
progressively migrated the Annotation feature's state management to Redux,
without breaking the running application.

### Stack

- **RTK Query** — fetches from `/fiftyone` (REST) and `/graphql` (GraphQL)
- **Redux slice** (`annotationSlice.ts`) — annotation UI state
- **`createSelector`** — derived state replacing Jotai derived atoms
- **Dual-write hooks** — dispatch to Redux AND set Jotai atoms during migration
- **Jotai→Redux bridge** — syncs remaining Jotai atoms into the Redux store

### Migration scorecard

| State | Migrated to Redux | Still on Jotai | Why |
|---|---|---|---|
| `isEditing` | Yes (selector) | Bridge only | — |
| `activeSchemas` | Yes (slice + selector) | Bridge only | — |
| `schemaTab` | Yes (slice) | Bridge only | — |
| `labelSchemasData` | Yes (slice) | Bridge only | — |
| `exploreActiveFields` | Yes (slice) | Bridge only | — |
| `visibleLabelSchemas` | Yes (`createSelector`) | Jotai atom still exists | Jotai version needed by internal atom graph |
| `inactiveLabelSchemas` | Yes (`createSelector`) | Jotai atom still exists | Same |
| `fieldType(path)` | Yes (`createSelector`) | Jotai atom still exists | Same |
| `fieldTypes` | Yes (`createSelector`) | Jotai atom still exists | Same |
| `fieldsOfType(type)` | Yes (`createSelector`) | Jotai atom still exists | Same |
| `currentType` | Yes (`createSelector`) | Jotai atom still exists | Same |
| `currentField` (read) | Yes (`createSelector`) | Jotai atom still exists | Write side needs overlay |
| `currentFieldIsReadOnly` | Yes (`createSelector`) | Jotai atom still exists | Same |
| `currentFields` | Yes (`createSelector`) | Jotai atom still exists | Same |
| `labels` (list) | Yes (slice) | Bridge only | — |
| `editingLabel` | Yes (serialized) | Full object in Jotai | Overlay refs |
| `current` | No | Yes | Holds live overlay reference |
| `currentOverlay` | No | Yes | Returns canvas renderer object |
| `currentData` | No | Yes | Write side mutates overlay |
| `editing` | No | Yes | Holds `PrimitiveAtom` reference |

**~20 component files migrated** from `useAtomValue(someAtom)` to Redux hooks.

---

## Architectural finding: overlay leakage

The single biggest obstacle to a full Redux migration is that **renderer objects
leaked into the state layer**.

### The problem

`AnnotationLabel` (defined in `@fiftyone/state`) bundles serializable data with
a live overlay reference:

```ts
interface AnnotationLabel {
  path: string;           // serializable
  type: string;           // serializable
  data: AnnotationLabelData; // serializable
  overlay: BaseOverlay;   // NOT serializable — live canvas object
  isNew?: boolean;        // serializable
}
```

This type flows into Jotai atoms:

```
editing  →  PrimitiveAtom<AnnotationLabel>  (holds overlay)
current  →  derived from editing            (exposes overlay)
currentOverlay  →  derived from current     (returns overlay)
currentData     →  write side calls overlay.updateLabel()
```

Because the overlay is embedded in the state object, these atoms **cannot** be
moved to Redux (or any serializable store). Redux explicitly warns against
non-serializable values in the store, and for good reason — they break
DevTools, persistence, time-travel, and hydration.

### The fix: ID-based lookup

State should hold **identifiers**, not **instances**. The renderer should own
its objects and expose them via lookup.

**Current (leaky):**
```
State:    { ..., overlay: <BoundingBoxOverlay instance> }
Component:  const overlay = useAtomValue(currentOverlay);
            overlay.setDraggable(true);
```

**Proposed (clean):**
```
State:    { ..., overlayId: "abc-123" }
Component:  const overlayId = useCurrentOverlayId();       // from Redux
            const overlay = useOverlayById(overlayId);      // from Lighter
            overlay?.setDraggable(true);
```

Where `useOverlayById` is a thin Lighter hook:
```ts
// In @fiftyone/lighter
export const useOverlayById = (id: string | null) => {
  const { scene } = useLighter();
  return id ? scene?.getOverlayById(id) ?? null : null;
};
```

### What this enables

1. **Full Redux migration** — every piece of annotation state becomes
   serializable. No more Jotai bridge needed.

2. **Redux DevTools for everything** — time-travel through annotation state
   changes, including which label is selected, what field is active, etc.

3. **Persistence / SSR** — state can be serialized to JSON for session restore,
   URL deep-linking, or server-side rendering.

4. **Cleaner Lighter API** — the renderer becomes a true "view layer" that
   components query by ID, rather than a state store that leaks references.

5. **Testability** — annotation logic can be tested with plain objects, without
   mocking canvas renderers.

6. **State management agnostic** — once overlays are looked up by ID, the state
   layer doesn't care whether it's Redux, Jotai, Zustand, or signals. The
   coupling is broken.

### Scope of the refactor

The overlay reference appears in:

- `AnnotationLabel.overlay` (the root cause — `@fiftyone/state`)
- `editing` atom (holds `PrimitiveAtom<AnnotationLabel>`)
- `current`, `currentOverlay`, `currentData` (derived atoms in `Edit/state.ts`)
- `LabelEntry.tsx` (reads `atom` for overlay ID)
- `useLabels.ts` (creates labels with overlay refs)
- `useCreateAnnotationLabel.ts` (factory that bundles overlay into label)
- `useAddAnnotationLabelToRenderer.ts` (adds overlay to scene)
- Several Edit panel components (Position, Id, AnnotationSchema, etc.)

The fix would be:

1. Add `overlayId: string` to `AnnotationLabel`, remove `overlay` field
2. Add `scene.getOverlayById(id)` to Lighter's public API
3. Create `useOverlayById(id)` hook in Lighter
4. Update label creation to store ID instead of reference
5. Update consumers to look up overlays at render time

This is a focused refactor (~15-20 files) with a clear boundary. It doesn't
require changing Lighter internals — just adding a lookup method and stopping
the reference from leaking into state.

---

## Other observations

### RTK Query works well with the existing backend

- REST endpoints (`/fiftyone`) work out of the box
- GraphQL queries work via a generic `graphql` endpoint with `POST /graphql`
- The operator RPC pattern (`useSchemaManager`) could be modeled as RTK Query
  mutations with optimistic updates

### The Jotai→Redux bridge pattern is viable but fragile

- Uses `useEffect` to sync Jotai atoms into Redux — one-frame delay on mount
- Caused a loading deadlock when `<ReduxExperiment>` was behind a loading gate
  (fix: render bridge unconditionally)
- Dual-write hooks work well for gradual migration but are easy to get wrong
- A production migration would want to flip the source of truth (Redux-first)
  rather than running two systems indefinitely

### Provider placement matters

- Started with `<Provider>` inside `<Annotate>` — broke when hooks were used
  in `Modal.tsx` and `ModalNavigation.tsx`
- Moved `<Provider>` to wrap the entire Modal portal — fixed all access issues
- In a full migration, the Provider would go at the app root (like RecoilRoot)

### `createSelector` is a natural replacement for Jotai derived atoms

- Same memoization semantics
- Parameterized selectors (`selectFieldType(path)`) replace `atomFamily`
- Composition works the same way (selectors reading other selectors)
- Bonus: visible in Redux DevTools without extra setup

---

## Files created/modified

### New files (in `Annotate/redux/`)
- `store.ts` — Redux store with RTK Query + annotation slice
- `api.ts` — RTK Query API (REST + GraphQL endpoints)
- `annotationSlice.ts` — slice + `createSelector` derived state
- `hooks.ts` — typed read hooks, write hooks (dual-write), derived selector hooks
- `ReduxExperiment.tsx` — Jotai→Redux bridge + RTK Query logger

### Modified files (~20)
See migration scorecard above. Every `useAtomValue(someAtom)` call in the
Annotation feature was evaluated. ~65% were migrated to Redux hooks; the
remainder depend on non-serializable overlay references.
