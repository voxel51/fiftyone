# App State Management

## State Type Selection

Use "least capability" principle. Choose the simplest pattern that works:

- **Local State**: UI-only, resets with component → `useState`, `useReducer`
- **Context API**: Small bounded tree, static-ish data → `useContext` (keep
  contexts minimal to avoid re-renders)
- **Atoms**: Reactive global state → Jotai (preferred) or Recoil (legacy)

## Atom Rules

1. **Never export atoms directly**. Treat atoms as implementation details.
2. **Only export domain hooks** that read/mutate atoms. No raw `useAtomValue`,
   `useSetAtomValue`, `useRecoilValue`, or `useSetRecoilValue` in components.
3. **Domain hook patterns**:
    - `use<Feature>()`: Read API, must be idempotent (e.g., `useLighter()`,
      `useTimeline()`)
    - `use<Feature><Action>()` or `use<Action><Feature>()`: Commands, can have
      side-effects (e.g., `useCreateTimeline()`, `useLighterSetup()`)
4. **File layout**:
    - `packages/<domain>/model/atoms.ts` (not exported)
    - `packages/<domain>/model/selectors.ts` (not exported)
    - `packages/<domain>/hooks.ts` (exported)
    - `packages/<domain>/bridge.ts` (optional, for JS interop)

## JS Interop

For non-React access, use bridge APIs with explicit naming (e.g.,
`lighterBridge`, `annotationBridge`). If you must expose an atom globally,
prefix with `__unsafe` (e.g., `__unsafeGlobalFeatureAtom`).

# Design System

New UI code uses VOODO (`@voxel51/voodo`). Material UI is legacy: it predates
VOODO and is being migrated out. This covers every `@mui/*` entry point —
importing the same primitives from `@mui/system`, `@mui/base`, or `@mui/lab` is
still Material UI.

There are two tiers, and the distinction matters.

## Tier 1: forbidden

If a VOODO equivalent exists, do not use the Material UI version in new or
newly-rewritten code. There is no shipping-speed exemption: the component
already exists, so reaching for MUI adds migration debt for no gain.

| Forbidden `@mui/material` import                                             | Required `@voxel51/voodo` replacement                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Typography`                                                                 | `Text`, `Heading`                                          |
| `Box`, `Stack`, `Grid`                                                       | `Stack`                                                    |
| `Button`                                                                     | `Button`, `RichButton`                                     |
| `IconButton`                                                                 | `Clickable`                                                |
| `Tooltip`                                                                    | `Tooltip`                                                  |
| `TextField`, `OutlinedInput`                                                 | `Input`, `TextArea`                                        |
| `Select`, `Autocomplete`                                                     | `Select`, `Dropdown`                                       |
| `Menu`, `MenuList`, `MenuItem`, `Popover`                                    | `ContextMenu`, `Dropdown`                                  |
| `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow` | `Table`, `TableBody`, `TableCell`, `TableHead`, `TableRow` |
| `Card`, `CardContent`, `CardHeader`, `Paper`                                 | `Card`                                                     |
| `Chip`                                                                       | `Pill`, `TextBadge`                                        |
| `CircularProgress`, `LinearProgress`, `Skeleton`                             | `Spinner`                                                  |
| `Checkbox`                                                                   | `Checkbox`                                                 |
| `Radio`, `RadioGroup`                                                        | `Radio`, `RadioGroup`                                      |
| `Switch`                                                                     | `Toggle`, `ToggleSwitch`                                   |
| `Slider`                                                                     | `SingleValueSlider`, `MultiValueSlider`                    |
| `Divider`                                                                    | `Divider`                                                  |
| `Drawer`                                                                     | `Drawer`                                                   |
| `Accordion`, `Collapse`                                                      | `Collapsible`                                              |
| `List`, `ListItem`, `ListItemText`, `ListItemIcon`                           | `ListItem`, `RichList`                                     |
| `Snackbar`                                                                   | `Toast`, `ActivityToast`                                   |
| `ImageList`, `ImageListItem`                                                 | `ImageList`                                                |
| `ToggleButton`, `ToggleButtonGroup`                                          | `RichButtonGroup`, `Toggle`                                |
| any `@mui/icons-material` icon                                               | `Icon` with `IconName`                                     |

Watch for same-name collisions: `Stack`, `Button`, and `Tooltip` exist in both
libraries. Check which one your import resolves to.

## Tier 2: discouraged

Where VOODO has no equivalent, Material UI may be used to keep shipping. Known
gaps: `Alert`/`AlertTitle`, the `Dialog` family and `Modal`, `Tabs`, `Link`,
and MUI's theming utilities (`useTheme`, `styled`, `sx`). Prefer composing from
VOODO primitives where that is reasonable, and expect these to be migrated once
VOODO covers them.

Report the gap to the VOODO owners so it can be closed, and say in the PR
description which gap you hit. If a listed VOODO component cannot handle your
case, or you believe a component belongs in tier 2 but is not listed above,
explain why in the PR rather than reaching for MUI silently.

## Existing MUI code

Pre-existing MUI usage is not a violation. In review, flag only MUI that is
**new with the change**: a new `@mui/*` import, or a new MUI component usage
where there was none. Do not flag pre-existing MUI imports or components in
files a change happens to touch, and do not flag edits that merely maintain
existing MUI usage (changing a prop, moving or reformatting an import).

Existing MUI code is also not a bug to fix opportunistically. Leave it unless
you are already rewriting that component. When you do migrate a file, remove it
from `.mui-allowlist.txt`; that list only shrinks.
