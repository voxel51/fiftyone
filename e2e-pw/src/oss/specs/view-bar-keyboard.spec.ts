import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { clsOf, getSessionView, kwargsOf } from "src/shared/session-state";

//
// A dataset per test INVOCATION, not per file or even per test. The applied
// view lives in the server session and survives page loads until the session
// moves to another dataset — a dataset shared across invocations lets one
// run's applied view leak into the next (including burn-in repeats of the
// same test), shifting every pill count and sample count these specs assert.
//
let datasetName: string;

const test = base.extend<{ viewBar: ViewBarPom; grid: GridPom }>({
  viewBar: async ({ page }, use) => {
    await use(new ViewBarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader, datasetFactory }) => {
  datasetName = getUniqueDatasetNameWithPrefix("view-bar-keyboard");

  await datasetFactory.createDataset({ datasetName, numSamples: 10 });

  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("view bar keyboard", () => {
  //
  // Adding a stage should leave the keyboard where the value goes, and the same
  // key that finishes the stage should run the view — describing a view without
  // reaching for the mouse in between.
  //
  test("a stage can be added, filled and applied without the mouse", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    const editor = await viewBar.addStage("Limit");

    const input = editor.param("limit").getByRole("textbox");
    await expect(input).toBeFocused();

    await input.pressSequentially("3");

    // The first Enter finishes the stage and moves the keyboard to Apply
    await page.keyboard.press("Enter");
    await editor.assert.isClosed();
    await expect(viewBar.applyBtn).toBeFocused();

    // The second runs the view
    await grid.run(() => page.keyboard.press("Enter"));

    await grid.assert.isEntryCountTextEqualTo("3 samples");

    const stages = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(stages[0])).toBe("Limit");
    expect(kwargsOf(stages[0])).toMatchObject({ limit: 3 });
  });

  //
  // The whole conversation can happen on the keyboard: reach the insert slot,
  // pick a stage, fill it, finish it, reach the next slot, and run the view —
  // two stages in, zero mouse.
  //
  test("multiple stages reach the view without the mouse", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    // Seed focus on the insert slot; everything after this is keys
    await viewBar.locator.getByLabel("Insert stage").last().focus();
    await page.keyboard.press("Enter");

    // The typeahead owns the keyboard: type to filter, Enter inserts.
    // Keys go nowhere until the typeahead mounts and takes focus.
    await expect(viewBar.insertTypeahead).toBeFocused();
    await page.keyboard.type("Skip");
    await page.keyboard.press("Enter");
    await viewBar.stageEditor.assert.isOpen();
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await expect(viewBar.applyBtn).toBeFocused();

    // Walk back to the nearest insert slot for the second stage — past the
    // clear-view [x] that sits between Apply and the stages
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(
      viewBar.locator.getByLabel("Insert stage").last(),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(viewBar.insertTypeahead).toBeFocused();
    await page.keyboard.type("Limit");
    await page.keyboard.press("Enter");
    await viewBar.stageEditor.assert.isOpen();
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await expect(viewBar.applyBtn).toBeFocused();

    await grid.run(() => page.keyboard.press("Enter"));

    await grid.assert.isEntryCountTextEqualTo("3 samples");
    const stages = await getSessionView(request, baseURL, datasetName);
    expect(stages).toHaveLength(2);
    expect(clsOf(stages[0])).toBe("Skip");
    expect(kwargsOf(stages[0])).toMatchObject({ skip: 2 });
    expect(clsOf(stages[1])).toBe("Limit");
    expect(kwargsOf(stages[1])).toMatchObject({ limit: 3 });
  });

  //
  // Escape walks backwards: the first closes an open editor, the second
  // returns the bar to the applied view — pending work is dismissed with the
  // same key that dismisses everything else.
  //
  test("Escape closes the editor, and Escape again clears pending work", async ({
    viewBar,
    page,
  }) => {
    const editor = await viewBar.addStage("Limit");
    await editor.fill("limit", "5");

    await page.keyboard.press("Escape");
    await editor.assert.isClosed();

    // The pill survived the first Escape, holding the pending stage. The
    // second Escape must land after focus settles on the pill — the bar
    // only hears it from inside
    await expect(viewBar.viewStages).toHaveCount(1);
    await expect(
      viewBar.viewStages.first().getByLabel("Edit stage"),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(viewBar.viewStages).toHaveCount(0);

    // Nothing in the bar holds focus once the draft is gone
    const focusedInBar = await page.evaluate(() => {
      const bar = document.querySelector("[data-cy='view-bar']");
      const active = document.activeElement;
      return Boolean(bar && active && bar.contains(active));
    });
    expect(focusedInBar).toBe(false);
  });

  //
  // Applying leaves the keyboard where the next stage begins: Apply itself
  // disappears once nothing is pending, so focus must move on rather than die
  // with the button.
  //
  test("applying moves the keyboard to the next insert slot", async ({
    viewBar,
    grid,
    page,
  }) => {
    const editor = await viewBar.addStage("Limit");
    await editor.fill("limit", "3");
    await page.keyboard.press("Enter");
    await expect(viewBar.applyBtn).toBeFocused();

    await grid.run(() => page.keyboard.press("Enter"));

    const slots = viewBar.locator.getByLabel("Insert stage");
    await expect(slots.last()).toBeFocused();

    // And that focus is enough to describe the next stage
    await page.keyboard.press("Enter");
    await expect(viewBar.insertTypeahead).toBeFocused();
    await page.keyboard.type("Skip");
    await page.keyboard.press("Enter");
    await editor.assert.isOpen();
  });

  //
  // Tab walks the bar in reading order and Shift+Tab walks back: the first
  // insert slot is the entry point, Apply is the exit.
  //
  test("Tab and Shift+Tab traverse the bar", async ({ viewBar, page }) => {
    const editor = await viewBar.addStage("Limit");
    await editor.fill("limit", "3");
    await page.keyboard.press("Enter");

    // The commit closes the editor and hands the keyboard to Apply; Tabbing
    // before that re-render lands walks a half-built bar
    await editor.assert.isClosed();
    await expect(viewBar.applyBtn).toBeFocused();

    // Pending changes, so Apply is the last stop
    const slots = viewBar.locator.getByLabel("Insert stage");
    await slots.first().focus();
    await expect(slots.first()).toBeFocused();

    // Forward: through the stage's own controls, ending on Apply
    const forward: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      forward.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ??
            document.activeElement?.getAttribute("data-cy") ??
            document.activeElement?.tagName ??
            "",
        ),
      );
      if (
        await viewBar.applyBtn.evaluate((el) => el === document.activeElement)
      )
        break;
    }
    expect(forward).toContain("Edit stage");
    expect(forward).toContain("Remove stage");
    await expect(viewBar.applyBtn).toBeFocused();

    // Backward from Apply returns through the same stops to the first slot
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+Tab");
      if (await slots.first().evaluate((el) => el === document.activeElement))
        break;
    }
    await expect(slots.first()).toBeFocused();
  });

  //
  // Escape means "I am done here" even when there is nothing to undo: an
  // already-applied stage releases the keyboard rather than holding it.
  //
  test("Escape releases an applied stage that has no pending edits", async ({
    viewBar,
    grid,
    page,
  }) => {
    const editor = await viewBar.addStage("Limit");
    await editor.fill("limit", "3");
    await page.keyboard.press("Enter");
    await grid.run(() => viewBar.applyBtn.click());

    // Reopen the applied stage, then walk back out
    await viewBar.editStage(0);
    await page.keyboard.press("Escape");
    await editor.assert.isClosed();

    // The second Escape must land after focus settles back on the pill
    await expect(
      viewBar.viewStages.first().getByLabel("Edit stage"),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    const focusedInBar = await page.evaluate(() => {
      const bar = document.querySelector("[data-cy='view-bar']");
      const active = document.activeElement;
      return Boolean(bar && active && bar.contains(active));
    });
    expect(focusedInBar).toBe(false);
    // and the applied stage is still there, since nothing was pending
    await expect(viewBar.viewStages).toHaveCount(1);
  });

  //
  // Enter must respect the same rule the outside-click path does: a stage
  // missing a required value is not finished, and closing its editor would only
  // hide work that cannot be applied.
  //
  test("Enter is refused while a required parameter is empty", async ({
    viewBar,
    page,
  }) => {
    const editor = await viewBar.addStage("Limit");

    await page.keyboard.press("Enter");

    await editor.assert.isOpen();
  });
});
