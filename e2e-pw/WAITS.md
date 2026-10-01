# Waiting in e2e specs

Every wait names the app event its action causes, then reads the result once.
CI enforces this with `scripts/check-e2e-waits.py`.

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

## Screenshots

- Only canvases. Check DOM with exact reads.
- Use `expectScreenshot` (exact: `maxDiffPixelRatio: 0, threshold: 0`). Masking
  or loosening a threshold is not allowed.
- Rendering is deterministic: Chromium runs at 1x, test datasets default to a
  one-color scheme, and the App renders once its bundled fonts load.

## When a test hangs

A failed or timed-out test prints "pending event waits": each wait still armed,
where it was armed, and the events the page sent instead. A wait that "never
arrived" usually means the action didn't change the state (so nothing
re-rendered) or the event fired before the wait armed (wrap the earlier action
instead).
