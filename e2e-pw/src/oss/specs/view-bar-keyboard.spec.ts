/**
 * The keyboard-only path through the view bar: adding a stage focuses its
 * first typeable control, Enter commits the stage and hands the keyboard to
 * Apply, and a second Enter runs the view.
 *
 * Every wait here is state-based — `toBeFocused`, `toBeHidden` and the grid's
 * mount/unmount events — because the two hops in the flow are asynchronous:
 * the popover mounts a frame after `expanded` flips, and Apply is focused in a
 * `requestAnimationFrame` after the stage commits.
 */

import type { Page } from "src/oss/fixtures";
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

    samples = []
    for i in range(10):
        sample = fo.Sample(
            filepath=f"/tmp/${datasetName}-{i}.png",
            index=i,
            score=i / 10,
            label=f"label-{i}",
            tags=["even"] if i % 2 == 0 else ["odd"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", confidence=i / 10, bounding_box=[0, 0, 1, 1]),
                    fo.Detection(label="dog", confidence=1 - i / 10, bounding_box=[0, 0, 1, 1]),
                ]
            ),
        )
        if i < 5:
            sample["sometimes"] = i
        samples.append(sample)

    dataset.add_samples(samples)
  `);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

/**
 * The two Enters: the first closes the stage and moves the keyboard to Apply,
 * the second runs the view. Asserts each hop rather than pressing blind, so a
 * failure names which one broke.
 */
const commitAndApply = async (
  viewBar: ViewBarPom,
  grid: GridPom,
  page: Page,
) => {
  // The handler is on the popover root, so Enter only commits while the
  // keyboard is still inside it. Asserted here so a stage that loses focus —
  // to a portaled picker, say — fails saying that rather than saying the
  // editor never closed
  await expect(viewBar.editor.locator(":focus")).toHaveCount(1);

  await page.keyboard.press("Enter");

  await expect(viewBar.editor).toBeHidden();
  await expect(viewBar.applyBtn).toBeFocused();

  await grid.run(() => page.keyboard.press("Enter"));
};

test.describe("view bar keyboard: stages whose first control is typeable", () => {
  test("Limit", async ({ viewBar, grid, page, request, baseURL }) => {
    await viewBar.addStage("Limit");

    await expect(viewBar.param("limit").getByRole("textbox")).toBeFocused();
    await page.keyboard.type("3");
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(view.map(clsOf)).toEqual(["Limit"]);
    expect(kwargsOf(view[0])).toEqual({ limit: 3 });
    await grid.assert.isEntryCountTextEqualTo("3 samples");
  });

  test("Skip", async ({ viewBar, grid, page, request, baseURL }) => {
    await viewBar.addStage("Skip");

    await expect(viewBar.param("skip").getByRole("textbox")).toBeFocused();
    await page.keyboard.type("4");
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(kwargsOf(view[0])).toEqual({ skip: 4 });
    await grid.assert.isEntryCountTextEqualTo("6 samples");
  });

  test("Take", async ({ viewBar, grid, page, request, baseURL }) => {
    await viewBar.addStage("Take");

    await expect(viewBar.param("size").getByRole("textbox")).toBeFocused();
    await page.keyboard.type("2");
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Take");
    expect(kwargsOf(view[0]).size).toBe(2);
    await grid.assert.isEntryCountTextEqualTo("2 samples");
  });

  test("Shuffle", async ({ viewBar, grid, page, request, baseURL }) => {
    await viewBar.addStage("Shuffle");

    await expect(viewBar.param("seed").getByRole("textbox")).toBeFocused();
    await page.keyboard.type("51");
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Shuffle");
    expect(kwargsOf(view[0]).seed).toBe(51);
  });

  test("MatchTags", async ({ viewBar, grid, page, request, baseURL }) => {
    await viewBar.addStage("MatchTags");

    await expect(viewBar.param("tags").getByRole("textbox")).toBeFocused();
    await page.keyboard.type("even");
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("MatchTags");
    expect(kwargsOf(view[0]).tags).toEqual(["even"]);
    await grid.assert.isEntryCountTextEqualTo("5 samples");
  });

  test("Match, whose expression editor is the first control", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("Match");

    await expect(viewBar.param("filter").getByRole("textbox")).toBeFocused();
    // Typed rather than filled, so the suggestion list opens and closes under
    // the caret exactly as it does for a user — Enter must still commit
    await page.keyboard.type('F("index") > 4');
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Match");
    expect(kwargsOf(view[0]).filter).toBeTruthy();
    await grid.assert.isEntryCountTextEqualTo("5 samples");
  });
});

test.describe("view bar keyboard: stages whose first control is a field picker", () => {
  /**
   * The picker cannot be driven from the keyboard yet (see the report), so the
   * field is chosen with the mouse. What is under test here is the rest of the
   * flow: that Enter still commits a stage whose required params are satisfied,
   * and that Apply takes the keyboard.
   */
  test("Exists commits from the keyboard once its field is set", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("Exists");
    await viewBar.chooseField("field", "sometimes");

    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Exists");
    expect(kwargsOf(view[0]).field).toBe("sometimes");
    await grid.assert.isEntryCountTextEqualTo("5 samples");
  });

  test("LimitLabels types into the param the picker unblocks", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("LimitLabels");
    await viewBar.chooseField("field", "ground_truth");

    // `limit` is disabled until `field` is set, so it can only take the caret
    // after the picker has been answered
    const limit = viewBar.param("limit").getByRole("textbox");
    await limit.focus();
    await page.keyboard.type("1");
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("LimitLabels");
    expect(kwargsOf(view[0])).toMatchObject({
      field: "ground_truth",
      limit: 1,
    });
  });

  test("FilterLabels types its expression after the picker unblocks it", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("FilterLabels");
    await viewBar.chooseField("field", "ground_truth");

    const filter = viewBar.param("filter").getByRole("textbox");
    await filter.focus();
    await page.keyboard.type('F("label") == "cat"');
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("FilterLabels");
    expect(kwargsOf(view[0]).field).toBe("ground_truth");
    expect(kwargsOf(view[0]).filter).toBeTruthy();
  });

  test("SortBy commits from the keyboard once its field is set", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("SortBy");
    await viewBar.chooseField("field_or_expr", "index");

    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("SortBy");
    expect(kwargsOf(view[0]).field_or_expr).toBe("index");
  });

  test("ToPatches commits from the keyboard once its field is set", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("ToPatches");
    await viewBar.chooseField("field", "ground_truth");

    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("ToPatches");
    expect(kwargsOf(view[0]).field).toBe("ground_truth");
    await grid.assert.isEntryCountTextEqualTo("20 patches");
  });

  test("GroupBy commits from the keyboard once its field is set", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("GroupBy");
    await viewBar.chooseField("field_or_expr", "label");

    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("GroupBy");
    expect(kwargsOf(view[0]).field_or_expr).toBe("label");
  });

  test("SelectFields commits from the keyboard once its fields are set", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("SelectFields");
    await viewBar.chooseField("field_names", "score");

    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("SelectFields");
    expect(kwargsOf(view[0]).field_names).toEqual(["score"]);
  });

  test("SetField commits from the keyboard once its field is set", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("SetField");
    await viewBar.chooseField("field", "score");

    const expr = viewBar.param("expr").getByRole("textbox");
    await expr.focus();
    await page.keyboard.type('F("index") * 2');
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("SetField");
    expect(kwargsOf(view[0]).field).toBe("score");
  });
});

test.describe("view bar keyboard: the flow's own rules", () => {
  test("adding a stage puts the caret inside its editor", async ({
    viewBar,
  }) => {
    await viewBar.addStage("Limit");

    // The contract is that the keyboard lands somewhere useful, whichever
    // control that turns out to be for a given stage
    await expect(viewBar.editor.locator(":focus")).toHaveCount(1);
  });

  test("shift+Enter does not commit the stage", async ({ viewBar, page }) => {
    await viewBar.addStage("Limit");

    await viewBar.param("limit").getByRole("textbox").focus();
    await page.keyboard.type("3");
    await page.keyboard.press("Shift+Enter");

    await expect(viewBar.editor).toBeVisible();
  });

  //
  // Encodes the rule the outside-click handler already enforces: a stage with
  // an unfilled required param refuses to close, because closing it would hide
  // work that cannot be applied. The Enter handler does not consult
  // `incomplete`, so this currently fails — see the report.
  //
  test("Enter is refused while a required param is empty", async ({
    viewBar,
    page,
  }) => {
    await viewBar.addStage("LimitLabels");

    await page.keyboard.press("Enter");

    await expect(viewBar.editor).toBeVisible();
  });

  test("Enter inside the JSON editor inserts a newline", async ({
    viewBar,
    page,
  }) => {
    await viewBar.addStage("Match");
    await viewBar.chooseEditor("filter", "json");

    await viewBar.param("filter").locator(".monaco-editor").click();
    await page.keyboard.type("{");
    await page.keyboard.press("Enter");

    await expect(viewBar.editor).toBeVisible();
  });

  test("two stages, each committed from the keyboard", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("Skip");
    await expect(viewBar.param("skip").getByRole("textbox")).toBeFocused();
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await expect(viewBar.editor).toBeHidden();

    await viewBar.addStage("Limit");
    await expect(viewBar.param("limit").getByRole("textbox")).toBeFocused();
    await page.keyboard.type("3");
    await commitAndApply(viewBar, grid, page);

    const view = await getSessionView(request, baseURL, datasetName);
    expect(view.map(clsOf)).toEqual(["Skip", "Limit"]);
    await grid.assert.isEntryCountTextEqualTo("3 samples");
  });
});

// Reaching the insert slot without a mouse is not possible yet: the collapsed
// "+" is a `div` with an `onClick` and no `tabIndex`, so Tab skips it and it
// has no key handler. Every test above clicks it to open the stage list. A
// keyboard-only path needs the slot to be a button.
test.describe
  .skip("view bar keyboard: reaching the insert slot (the '+' is not focusable)", () => {
  test("Tab reaches the insert slot", async () => {});
});
