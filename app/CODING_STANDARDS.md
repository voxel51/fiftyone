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
| `IconButton`                                                                 | `IconAction`, `Clickable`                                  |
| `Tooltip`                                                                    | `Tooltip`                                                  |
| `TextField`, `OutlinedInput`                                                 | `Input` or `TextArea`, in `FormField` for label/error      |
| `Select`, `Autocomplete`                                                     | `Select`, `Combobox`, `Dropdown`                           |
| `Menu`, `MenuList`, `MenuItem`                                               | `ContextMenu`, `Dropdown`                                  |
| `Popover`                                                                    | `Popover`                                                  |
| `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow` | `Table`, `TableBody`, `TableCell`, `TableHead`, `TableRow` |
| `Card`, `CardContent`, `CardHeader`, `Paper`                                 | `Card`                                                     |
| `Chip`                                                                       | `Pill`, `TextBadge`                                        |
| `CircularProgress`, `Skeleton`                                               | `Spinner`, `LoadingDots`                                   |
| `LinearProgress`                                                             | `Progress`                                                 |
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
| any `@mui/icons-material` icon                                               | the per-icon component (`<CaretDownIcon />`)               |

Watch for same-name collisions: `Stack`, `Button`, and `Tooltip` exist in both
libraries. Check which one your import resolves to.

Some rows are approximate rather than drop-in: `Stack` is one-dimensional
flexbox (true two-dimensional layouts can use plain CSS grid on a `div` — just
not MUI `Grid`), `Dropdown`/`ContextMenu` are menus rather than general
anchored popovers, and `Select` covers typeahead and multi-select but not async
loading. Preserve the original layout, interaction, and accessibility behavior
when migrating. If a replacement genuinely cannot express your case, that falls
under the tier-2 escape hatch below.

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

Tier-2 usage still triggers the `no-restricted-imports` ESLint warning from the
MUI freeze. That warning is expected and acceptable here — do not add the file
to `.mui-allowlist.txt` to silence it; the allowlist is only for pre-freeze
legacy files.

## Existing MUI code

Pre-existing MUI usage is not a violation. In review, flag only MUI that is
**new with the change**: a new `@mui/*` import, or a new MUI component usage
where there was none. Do not flag pre-existing MUI imports or components in
files a change happens to touch, and do not flag edits that merely maintain
existing MUI usage (changing a prop, moving or reformatting an import).

Existing MUI code is also not a bug to fix opportunistically. Leave it unless
you are already rewriting that component. When you do migrate a file, remove it
from `.mui-allowlist.txt`; that list only shrinks.

# App Events

App code has one event pattern: typed `@fiftyone/events` bus events, with a
typed event map beside the feature. Send them on the shared bus (`useEventBus`
in components, `getEventBus` elsewhere), or, for an object whose listeners
attach to it alone (a looker, a grid item), on its own `LocalEventTarget` or
`EventDispatcher` from `@fiftyone/events`.

- Never build or dispatch a DOM event: no `Event`, `CustomEvent` or other DOM
  event constructor, no subclass of one, and no `dispatchEvent(event)`. A
  plugin bundles its own copy of the bus, so it sends through
  `window.__FO_EVENTS__.dispatch`.
- Never fake user input to reuse a handler. Call the behavior the input would
  run, and open or focus a component through its own props; if a component
  can't, raise the gap with its owners instead of working around it.
- Listening for events the browser or a library sends (resize, keydown, a media
  element's error) is fine, as is listening for a DOM event a plugin sends,
  skipping the App's own mirrors.

CI's `e2e-events` job (`e2e-pw/scripts/check-e2e-events.py`) fails on any DOM
event built or dispatched in App code outside `@fiftyone/events` itself (unit
tests excepted), and the ESLint config flags the same in the editor. For
plugins that listen, a deprecated module in `@fiftyone/events` mirrors a
closed, CI-pinned set of bus events to the DOM events the App used to send;
nothing is added to it.

# e2e Test Signals

When an e2e spec needs to know an App transition has rendered (a sample
loading, a save settling, a canvas drawing a frame), the App dispatches an
`e2e:` event on the `@fiftyone/events` bus. The rules, in full in
[`e2e-pw/CODING_STANDARDS.md`](../e2e-pw/CODING_STANDARDS.md#app-events):

- Send test signals on the bus only, as `e2e:` events, like every other App
  event (see App Events above).
- Dispatch them unconditionally. The bus drops `e2e:` events outside browser
  automation, so App code never checks for it.
- Pass a payload that costs work to build (a scan, a joined string) as a
  function, `dispatch("e2e:foo:drawn", () => ({ ... }))`, so it is built only
  under automation. Keep payload fields primitive.
- Add an event only for an App transition, not for state the DOM already shows
  (focus, visibility, text a click puts on screen), and only with a spec that
  waits for it. CI fails on `e2e:` events nothing waits for.

CI's `e2e-events` job fails on automation checks in App code, and the ESLint
config flags them in the editor.
