# App State Management

## State Type Selection

Use "least capability" principle. Choose the simplest pattern that works:

-   **Local State**: UI-only, resets with component → `useState`, `useReducer`
-   **Context API**: Small bounded tree, static-ish data → `useContext` (keep
    contexts minimal to avoid re-renders)
-   **Atoms**: Reactive global state → Jotai (preferred) or Recoil (legacy)

## Atom Rules

1. **Never export atoms directly**. Treat atoms as implementation details.
2. **Only export domain hooks** that read/mutate atoms. No raw `useAtomValue`,
   `useSetAtomValue`, `useRecoilValue`, or `useSetRecoilValue` in components.
3. **Domain hook patterns**:
    - `use<Feature>()`: Read API, must be idempotent (e.g., `useLighter()`,
      `useTimeline()`)
    - `use<Feature>Actions()`: Commands, can have side-effects (e.g.,
      `useCreateTimeline()`, `useLighterSetup()`)
4. **File layout**:
    - `packages/<domain>/model/atoms.ts` (not exported)
    - `packages/<domain>/model/selectors.ts` (not exported)
    - `packages/<domain>/hooks.ts` (exported)
    - `packages/<domain>/bridge.ts` (optional, for JS interop)

## JS Interop

For non-React access, use bridge APIs with explicit naming (e.g.,
`lighterBridge`, `annotationBridge`). If you must expose an atom globally,
prefix with `__unsafe` (e.g., `__unsafeGlobalFeatureAtom`).
