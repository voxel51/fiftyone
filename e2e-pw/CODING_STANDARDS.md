# e2e coding standards

Binding for every spec, POM and App `e2e:` event. The core rule: when an
expectation depends on product events (a load, a save, a render, a query), the
spec runs the action through the app event it causes, then reads the result
once. Plain component interactions use normal Playwright. CI's `e2e-events` job
enforces these rules with `scripts/check-e2e-events.py`.

## Why not Playwright's auto-waiting

Playwright's default is to retry: web-first assertions and actionability checks
poll the page until it looks right or a timeout expires. That passes whenever
the App ends up in the expected state, however it got there, and fails with
only a timeout when it doesn't.

- **Retries hide bugs.** A save that repeats forever, a mask that paints only
  after a second reload, or a video that starts behind a dialog all eventually
  look right to a poll. The event pattern followed by one exact read fails on
  them.
- **Failures should name their cause.** A timed-out poll says the page never
  matched. A missing event says which event never arrived and which events
  arrived instead, which points at the code that didn't run.
- **Timing should not matter.** A polled test passes or fails depending on how
  fast the machine is. An action run through the event it causes behaves the
  same on a laptop and on a loaded CI runner, so a result reproduces.
- **Specs are written by coding agents.** An agent can't tell a slow page from
  a broken one by watching it, and given retries and timeouts it tunes them
  until the test passes. A strict, checkable pattern — name the cause, read
  once — is a guardrail it can follow and CI can enforce.

The App dispatches an `e2e:` event wherever a spec needs to know a state has
rendered. That instrumentation is the usual argument for polling, but an agent
writes the component and its spec together, so the event costs a line in the
same change. The events also document what each piece of UI considers done.

## When the event pattern applies

The event pattern covers product events: what an action sets off in the App
beyond the element it touched, such as a sample loading, a save, a render, a
query or a mode switch. If any expectation after an action depends on product
events having happened, the spec uses the event pattern before asserting
anything.

A plain component interaction doesn't. Filling an input, clicking a button that
opens a menu, toggling a checkbox, and checking what that component itself
renders use normal Playwright: its auto-waiting actions and web-first
assertions. Form-control matchers (`toHaveValue`, `toBeChecked`, `toBeFocused`,
`toBeEnabled`, `toBeDisabled`, `toBeEditable`) need nothing more. Any other
web-first matcher (`toBeVisible`, `toHaveText`, `toHaveCount`, ...) is the
usual stand-in for a product event, so a component-only use says why on its
line or the line above with `// component-only: <why>`; CI rejects it
otherwise.

```ts
// a plain component: normal Playwright
const search = page.getByPlaceholder("Search");
await search.fill("cat");
await expect(search).toHaveValue("cat");
await menuButton.click();
// component-only: the menu opens on click, nothing loads
await expect(menu).toBeVisible();

// product events: the filter queries the server and redraws the grid
await grid.afterTilesDrawn(2, () => sidebar.applyFilter("cat"));
await grid.assert.isEntryCountTextEqualTo("2 samples");
```

## The event pattern

1. **Run the action through its event.** `after` arms a listener for the event,
   runs the action that causes it, and resolves when it arrives:

    ```ts
    await eventUtils.after("e2e:modal:opened", () => grid.openFirstSample());
    ```

2. **Read once, exactly.** Make a single read with an exact expectation:

    ```ts
    expect(await modal.sidebar.entryText("filepath")).toBe("/data/0.png");
    ```

Not allowed:

- polls: `expect.poll`, `toPass`, retry loops
- timeouts: `waitForTimeout`, explicit `timeout:` options, `setTimeout`
- web-first assertions standing in for product events, such as `toHaveText` on
  a count a query fills or `toBeVisible` on a sample that loads
- DOM waits: `waitForSelector`, `waitForFunction`, `locator.waitFor`
- force clicks, and app code guarded by `if (isE2E())`

## App events

Test signals are `@fiftyone/events` bus events whose names start with `e2e:`.
The bus drops them outside browser automation, so dispatch them
unconditionally, after the state they describe has rendered:

```ts
type FooE2EEvents = { "e2e:foo:shown": { count: number } };

useEffect(() => {
    getEventBus<FooE2EEvents>().dispatch("e2e:foo:shown", { count });
}, [count]);
```

- Use primitive payload fields only, since the test sees primitives only.
- Name the state, not the action: `e2e:annotate:editing { editing }`.
- If the state a spec needs has no event, add one where the state commits.
- A plugin bundles its own copy of the bus, so it sends through
  `window.__FO_EVENTS__.dispatch` instead.

## Helpers (`src/shared/event-utils`)

- `after(event, action, predicate?)`: resolve on the event the action causes.
- `afterAll(conditions, action)`: several events, in any order.
- `afterSequence(events, action)`: events that arrive in order.
- `untilState(event, holds, predicate?)`: for state the app settles into on its
  own (no test action causes it). It reads once, then waits.
- `recorded(event)` and `latest(events)`: read the document's event record,
  kept from page load.

POMs wrap these. For example, `modal.afterSampleLoaded(action)`,
`grid.afterTilesDrawn(n, action)` and `episode.afterReady(file, action)`. Reuse
them before adding new ones.

## POMs

- Pages and shared components (grid, modal, sidebar) get a POM; specs compose
  POMs instead of raw locators.
- Assertions live in an asserter class the POM exposes as `pom.assert`, never
  in the POM itself.
- Static locators are `get` accessors; dynamic ones are `getX(param)` methods.
- Actions are verbs and resolve on the `e2e:` event they cause.

See the README's POM template.

## Test size

- Keep each test small, under about a minute locally. Downstream CI runs these
  specs at two to four times the duration, so a long test is a timeout risk
  there. Split large flows into focused tests.
- Avoid `test.describe.serial` unless tests depend on each other's state. One
  failure re-runs the whole file on every retry and marks healthy siblings as
  retried. When tests mutate shared data, give each its own sample
  (`numSamples` plus `indexToId` ids) instead.

## Timing

Speed is tested on purpose, not through waits. When a spec should hold the App
to a time budget, measure it after the event resolves, as its own assertion:

```ts
// counters install before navigating, and record from document start
const opened = await eventUtils.initCounter("e2e:modal:opened");
const drawn = await eventUtils.initCounter("e2e:looker:canvas-loaded");
// ...navigate, then:
await modal.afterSampleLoaded(() => grid.openFirstSample());
const [open] = await opened.timeline();
const draw = (await drawn.timeline()).at(-1);
expect(draw.t - open.t).toBeLessThan(MODAL_DRAW_BUDGET_MS);
```

`initCounter` records each event's `performance.now()` at dispatch. The budget
is the claim the spec makes, so name it and explain where it comes from. A
timing assertion never decides when a spec proceeds, and an event never carries
a timeout.

## Datasets

- Build every dataset with `DatasetFactory.createDataset` (see the README's
  "Creating Datasets"). Never load zoo datasets: they download, change, and
  couple a spec to data it doesn't control.
- Build only what the spec asserts on, and derive each expected value from the
  data the spec builds.
- Data shared by a spec family lives beside the specs, as in
  `detections-data.ts`.
- Check persistence the way a user would: wrap the edit in
  `modal.sidebar.annotate.afterSave(...)`, then read what the App renders in a
  fresh browser context.

## Screenshots

Canvases (the looker, Lighter, 3D, video and grid tiles) draw pixels, not DOM.
An exact screenshot is how a spec checks what a canvas draws: which overlays,
where, in what color, at which frame. Don't stand in for it with app events
that describe the drawing, or with window or DOM probes.

- Screenshot only canvases; check DOM with exact reads.
- A capture holds the canvas and the media drawn under it (Lighter's image is
  an `<img>`) on the surface's own background, nothing else: no DOM drawn over
  the canvas (controls, timelines, toolbars, checkboxes, arrows, tooltips,
  toasts), no page behind it, no background between canvases. The asserters
  hide that DOM for the capture and park the pointer first; never widen a
  capture to include it.
- Capture grid tiles one at a time:
  `grid.assert.hasTileScreenshots(name, count)` checks the exact tile count,
  then gives each tile's canvas its own baseline in grid order (`<name>-1.png`,
  `<name>-2.png`, ...). Never capture a grid section whole.
- Take the screenshot after the event of the step it checks, one per state that
  matters.
- Capture through a POM's screenshot asserter (`hasScreenshot`), which compares
  exactly: `maxDiffPixelRatio: 0, threshold: 0`. Masking, cropping in other UI,
  or loosening a threshold is not allowed.
- Rendering is deterministic: Chromium runs at 1x, the e2e server defaults to a
  one-color pool, and the App renders once its bundled fonts load.
- Record macOS baselines with `--update-snapshots`; harvest Linux baselines
  from CI (see the README).
- Accept a new baseline only after reviewing the diff. A size change or a
  highlighted element is a behavior change, not render noise.

## Canvases

A `SampleCanvasPom` is the only authority over a canvas in the modal: every
input to it and every assertion on it goes through one. `modal.sampleCanvas`
spans the modal's sample, `modal.sampleCanvas3d` the 3D viewer,
`modal.groupSampleCanvas` a group modal's 2D pane, and
`modal.episode.canvas(tile)` a multimodal episode surface. CI's `e2e-events`
job fails on raw mouse input, clicks or hovers on canvas locators, and
screenshots taken outside the asserters.

- Drive the canvas only with its primitives: `move`, `movePixels`, `down`,
  `up`, `click`, `dblclick`, `drag`, `wheel` and `press`. No `page.mouse`, no
  `hover` or `click` on a canvas or looker locator, and no bounding-box math
  outside the POM.
- Assert only through its `assert`: `hasScreenshot`, `hasMediaScreenshot`,
  `hasCursor` (or a cursor passed to `move`) and `is`. Never screenshot a
  canvas any other way, and never compare one capture to another instead of a
  baseline.
- Never query canvas elements with locators or accessibility queries; the
  canvas is opaque to the DOM.
- `hasScreenshot` parks the pointer off the canvas and waits for hover
  affordances to hide before it captures, so specs don't park it themselves.
- Gestures live in the spec. Neither `SampleCanvasPom` nor any other POM wraps
  a feature gesture (`drawBox`, `drawCuboid`, `clickDetectionHandle`); the spec
  writes out the primitives, so every media type is tested the same way.

## When a test hangs

A failed or timed-out test prints "pending events": each event still expected,
where it was armed, and the events the page sent instead. A wait that "never
arrived" usually means the action didn't change the state (so nothing
re-rendered) or the event fired before the wait armed (wrap the earlier action
instead).
