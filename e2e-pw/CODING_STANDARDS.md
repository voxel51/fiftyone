# e2e coding standards

Binding for every spec, POM and App `e2e:` event. The core rule: every wait
names the app event its action causes, then reads the result once. CI's
`e2e-waits` job enforces the wait rules with `scripts/check-e2e-waits.py`.

## Why not Playwright's auto-waiting

Playwright's default is to retry: web-first assertions and actionability checks
poll the page until it looks right or a timeout expires. That passes whenever
the App ends up in the expected state, however it got there, and fails with
only a timeout when it doesn't.

- **Retries hide bugs.** A save that repeats forever, a mask that paints only
  after a second reload, or a video that starts behind a dialog all eventually
  look right to a poll. A cause-wait followed by one exact read fails on them.
- **Failures should name their cause.** A timed-out poll says the page never
  matched. A hung event wait says which event never arrived and which events
  arrived instead, which points at the code that didn't run.
- **Timing should not matter.** A polled test passes or fails depending on how
  fast the machine is. A wait on the event an action causes behaves the same on
  a laptop and on a loaded CI runner, so a result reproduces.
- **Specs are written by coding agents.** An agent can't tell a slow page from
  a broken one by watching it, and given retries and timeouts it tunes them
  until the test passes. A strict, checkable pattern — name the cause, read
  once — is a guardrail it can follow and CI can enforce.

The App dispatches an `e2e:` event wherever a spec needs to know a state has
rendered. That instrumentation is the usual argument for polling, but an agent
writes the component and its spec together, so the event costs a line in the
same change. The events also document what each piece of UI considers done.

## The rule

1. **Cause-wait.** Arm a listener for the event, run the action that causes it,
   and resolve when it arrives:

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
- retrying assertions: `toBeVisible`, `toHaveText`, `toHaveCount` and the other
  web-first matchers
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

## Timing

Speed is tested on purpose, not through waits. When a spec should hold the App
to a time budget, measure it after the cause-wait resolves, as its own
assertion:

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
timing assertion never decides when a spec proceeds, and a wait never carries a
timeout.

## Datasets

- Build every dataset with `DatasetFactory.createDataset` (see the README's
  "Creating Datasets"). Never load zoo datasets: they download, change, and
  couple a spec to data it doesn't control.
- Build only what the spec asserts on, and derive each expected value from the
  data the spec builds.
- Data shared by a spec family lives beside the specs, as in
  `detections-data.ts`.

## Screenshots

- Only canvases. Check DOM with exact reads.
- Use `expectScreenshot` (exact: `maxDiffPixelRatio: 0, threshold: 0`). Masking
  or loosening a threshold is not allowed.
- Rendering is deterministic: Chromium runs at 1x, the e2e server defaults to a
  one-color pool, and the App renders once its bundled fonts load.

## When a test hangs

A failed or timed-out test prints "pending event waits": each wait still armed,
where it was armed, and the events the page sent instead. A wait that "never
arrived" usually means the action didn't change the state (so nothing
re-rendered) or the event fired before the wait armed (wrap the earlier action
instead).
