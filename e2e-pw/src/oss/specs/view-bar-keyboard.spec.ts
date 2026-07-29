import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { clsOf, getSessionView, kwargsOf } from "src/shared/session-state";

const datasetName = getUniqueDatasetNameWithPrefix("view-bar-keyboard");

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

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_samples([
        fo.Sample(filepath=f"/tmp/${datasetName}-{i}.png", index=i)
        for i in range(10)
    ])
  `);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
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
    await viewBar.addStage("Limit");

    const input = viewBar.param("limit").getByRole("textbox");
    await expect(input).toBeFocused();

    await input.pressSequentially("3");

    // The first Enter finishes the stage and moves the keyboard to Apply
    await page.keyboard.press("Enter");
    await expect(viewBar.editor).toBeHidden();
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

    // The typeahead owns the keyboard: type to filter, Enter inserts
    await page.keyboard.type("Skip");
    await page.keyboard.press("Enter");
    await expect(viewBar.editor).toBeVisible();
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await expect(viewBar.applyBtn).toBeFocused();

    // Walk back to the nearest insert slot for the second stage
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Limit");
    await page.keyboard.press("Enter");
    await expect(viewBar.editor).toBeVisible();
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
    await viewBar.addStage("Limit");
    await viewBar.fill("limit", "5");

    await page.keyboard.press("Escape");
    await expect(viewBar.editor).toBeHidden();

    // The pill survived the first Escape, holding the pending stage
    await expect(viewBar.viewStages).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(viewBar.viewStages).toHaveCount(0);
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
    await viewBar.addStage("Limit");

    await page.keyboard.press("Enter");

    await expect(viewBar.editor).toBeVisible();
  });
});
