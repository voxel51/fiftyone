# e2e coding standards

Binding for every spec, POM and App `e2e:` event. The core rule: when an
expectation depends on product events (a load, a save, a render, a query), the
spec runs the action through the app event it causes, then reads the result
once. Plain component interactions use normal Playwright. CI's `e2e-events` job
enforces these rules, the App-side ones included, with
`scripts/check-e2e-events.py`; the App's ESLint config also flags the App-side
ones in the editor.

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

The App dispatches an `e2e:` event wherever a spec needs to know an App
transition has rendered. That instrumentation is the usual argument for
polling, but an agent writes the component and its spec together, so the event
costs a line in the same change. The events also document what each piece of UI
considers done.

## When the event pattern applies

The event pattern covers product events: what an action sets off in the App
beyond the element it touched, such as a sample loading, a save, a render, a
query or a mode switch. If any expectation after an action depends on product
events having happened, the spec uses the event pattern before asserting
anything.

A plain component interaction doesn't. Filling an input, clicking a button that
opens a menu, toggling a checkbox, and checking what that component itself
renders use normal Playwright: its auto-waiting actions and web-first
assertions. Plain UI state (where focus lands, whether a popover or menu shows,
the text a click puts on screen) is checked the way a user sees it, with
visible-state and form-control matchers such as `toBeVisible` or `toBeFocused`.
Don't add an App event for state these can see. Other web-first matchers (such
as `toHaveCount`) are the usual stand-in for a product event, so a
component-only use says why on its line or the line above with
`// component-only: <why>`. The checker's retrying-matcher list is the
authority on which matchers need the marker.

Larger App transitions stay events, even when something visible follows them: a
sample or timeline loading, a surface revealing, a save settling, a canvas
drawing a frame, a query refilling a list. A visible-state matcher on those
retries until the page happens to match, which is what the event pattern exists
to avoid.

```ts
// a plain component: normal Playwright
const search = page.getByPlaceholder("Search");
await search.fill("cat");
await expect(search).toHaveValue("cat");
await menuButton.click();
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

2. **Read once, exactly.** Make a single read with an exact expectation
   (`toBe`, `toEqual`, `toHaveLength`): the exact text, count, list or number
   the spec's data determines.

    ```ts
    expect(await modal.sidebar.entryText("filepath")).toBe("/data/0.png");
    ```

**An event payload decides when to read, never what to assert.** A predicate on
the payload picks which event ends the wait (the sample that loaded, the frame
that drew, the readout reaching the step's target), and the spec then reads
what the user sees: DOM text, or a canvas screenshot. Never `expect` on a
payload, return one from a POM for a spec to assert, or use one as an expected
value; that is the App grading itself, and it passes while the screen is wrong.
Timing an event (a time budget) or counting how often it fires (a second
loading screen, a remount) never reads a payload, so the rule doesn't apply to
them.

A mode switch (Explore to Annotate and back) remounts the modal's sidebar and
renderer, so it always runs through the event that remount sends, never as a
bare `await modal.sidebar.switchMode(...)`: wrap it in the modal POM's wait for
the surface it lands on (for example `modal.afterLighterReady`). CI rejects a
bare one.

Not allowed:

- loose matchers, which accept a range of values (such as `toContain` or
  `toBeGreaterThan`), "anything but" reads, and substring or regex checks
  inside `expect(...)`, except a named time budget (see Timing)
- polls (such as `expect.poll`) and retry loops
- timeouts and sleeps (such as `waitForTimeout` or an explicit `timeout:`)
- web-first assertions standing in for product events, such as `toHaveText` on
  a count a query fills or `toBeVisible` on a sample that loads
- assertions on event payloads (see the event pattern above)
- DOM waits (such as `waitForSelector`)
- force clicks, and App code guarded on automation

`scripts/check-e2e-events.py` holds the exact patterns.

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
- A payload that costs work to build (a scan over overlays, a joined string) is
  passed as a function, `dispatch("e2e:foo:drawn", () => ({ ... }))`; the bus
  calls it only under automation.
- Name the state, not the action: `e2e:annotate:editing { editing }`.
- If the App transition a spec needs has no event, add one where the state
  commits. Plain UI state needs none (see above).
- Every `e2e:` event the App dispatches has a spec or POM listening for it; CI
  fails on one nothing waits for, so delete it with its last listener.
- App code has one event pattern: typed `@fiftyone/events` bus events, on the
  shared bus or, for an object whose listeners attach to it alone, its own
  `LocalEventTarget`. It never builds or dispatches a DOM event (any `Event`
  constructor or subclass, or `dispatchEvent(event)`), fakes user input to
  reach a handler, or guards on automation (such as `isE2E()`). CI's
  `e2e-events` job (`scripts/check-e2e-events.py`) fails on each in every App
  package, unit tests excepted, and the App's ESLint config flags them in the
  editor. The only exemptions are inside `@fiftyone/events`: the bus's own
  automation check, and a deprecated module that mirrors a closed set of bus
  events to the DOM events plugins used to listen for. The checker pins that
  set, so it never grows.
- A plugin bundles its own copy of the bus, so it sends through
  `window.__FO_EVENTS__.dispatch` instead.

## Helpers

`src/shared/event-utils` holds the waits, documented in place: `after` for the
event an action causes, variants for several events or events in order, and
`untilState` for state the App settles into on its own (it reads once, then
waits). POMs wrap them (for example `modal.afterSampleLoaded(action)`); reuse a
POM's wait before adding a new one.

## POMs

- Pages and shared components (grid, modal, sidebar) get a POM; specs compose
  POMs instead of raw locators.
- Assertions live in an asserter class the POM exposes as `pom.assert`, never
  in the POM itself.
- Static locators are `get` accessors; dynamic ones are `getX(param)` methods.
- Actions are verbs and resolve on the `e2e:` event they cause.
- Every POM, member, fixture and helper is reached from a spec. CI's
  `e2e-events` job runs `scripts/check-unused-poms.mjs`, which fails on any
  that nothing reaches; delete them instead of keeping them for later.

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
// time-budget: the modal draws within one frame budget of opening
expect(draw.t - open.t).toBeLessThan(MODAL_DRAW_BUDGET_MS);
```

`initCounter` records each event's `performance.now()` at dispatch. The budget
is the claim the spec makes, so name it and explain where it comes from in a
`// time-budget: <why>` comment on its line or the line above; CI rejects any
other range matcher. A timing assertion never decides when a spec proceeds, and
an event never carries a timeout.

## Datasets

- Build every dataset with `DatasetFactory.createDataset` (see the README's
  "Creating Datasets"). Never load zoo datasets: they download, change, and
  couple a spec to data it doesn't control.
- Build only what the spec asserts on, and derive each expected value from the
  data the spec builds.
- Data shared by a spec family lives in a module beside the specs.
- Check persistence the way a user would: wrap the edit in
  `modal.sidebar.annotate.afterSave(...)`, then read what the App renders on a
  page from the `openFreshPage` fixture. It closes the test's page first: an
  App open alongside shares the server's session and syncs its state into the
  check. CI rejects `browser.newContext()` in specs and POMs.

## Screenshots

Canvases (the looker, Lighter, 3D, video, grid tiles) draw pixels, not DOM. An
exact screenshot is how a spec checks what a canvas draws: which overlays,
where, in what color, at which frame. Don't stand in for it with app events
that describe the drawing, or with window or DOM probes. SVG charts (the
histograms) count as drawn surfaces too: their geometry is not text a user
reads, so a screenshot is fair there.

- Screenshot only canvases and charts; check other DOM with exact reads.
- A capture holds the canvas and the media drawn under it (Lighter's image is
  an `<img>`) on the surface's own background, nothing else: no DOM drawn over
  the canvas (controls, timelines, toolbars, checkboxes, arrows, tooltips,
  toasts), no page behind it, no background between canvases. The asserters
  hide that DOM for the capture and park the pointer first; never widen a
  capture to include it.
- Capture grid tiles one at a time, through the grid asserter, which checks the
  exact tile count and gives each tile its own baseline in grid order. Never
  capture a grid section whole.
- Take the screenshot after the event of the step it checks, one per state that
  matters.
- Capture through a POM's screenshot asserter, which compares exactly. Masking,
  cropping in other UI, or loosening a threshold is not allowed.
- CI rejects every other capture. The checker's allowlist admits only the
  canvas, media and chart asserters; a new entry needs a human reviewer's
  approval, and an agent never adds one to get CI green.
- Rendering is deterministic: Chromium runs at 1x, the e2e server defaults to a
  one-color pool (a spec covering distinct default field colors sets its own
  pool and pins the order fields ask for colors), and the App renders once its
  bundled fonts load.
- Record macOS baselines with `--update-snapshots`; harvest Linux baselines
  from CI (see the README).
- Accept a new baseline only after reviewing the diff. A size change or a
  highlighted element is a behavior change, not render noise.

## Canvases

A `SampleCanvasPom` is the only authority over a canvas in the modal: every
input to it and every assertion on it goes through one. The modal POMs expose
one per surface (for example `modal.sampleCanvas`). CI's `e2e-events` job fails
on raw mouse input, clicks or hovers on canvas locators, and screenshots taken
outside the asserters.

- Drive the canvas only with its primitives (for example `move` or `drag`). No
  `page.mouse`, no `hover` or `click` on a canvas or looker locator, and no
  bounding-box math outside the POM.
- Assert only through its `assert` (for example `hasScreenshot`). Never
  screenshot a canvas any other way, and never compare one capture to another
  instead of a baseline.
- Never query canvas elements with locators or accessibility queries; the
  canvas is opaque to the DOM.
- The screenshot asserter parks the pointer off the canvas and waits for hover
  affordances to hide before it captures, so specs don't park it themselves.
- Gestures live in the spec. No POM wraps a feature gesture (such as drawing a
  box); the spec writes out the primitives, so every media type is tested the
  same way.

## When a test hangs

A failed or timed-out test prints "pending events": each event still expected,
where it was armed, and the events the page sent instead. A wait that "never
arrived" usually means the action didn't change the state (so nothing
re-rendered) or the event fired before the wait armed (wrap the earlier action
instead). A wait on a page with no event bus fails at once, and one whose page
loads a new document while it waits says so.

Run local specs on macOS under `caffeinate -i`: a Mac that sleeps mid-test
drops the App's `/events` stream, which fails the test with a false "Suspense
re-activated" error.
