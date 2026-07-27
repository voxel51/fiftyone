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
