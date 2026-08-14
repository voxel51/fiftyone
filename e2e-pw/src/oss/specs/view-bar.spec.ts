import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { clsOf, getSessionView, kwargsOf } from "src/shared/session-state";

//
// A dataset per test INVOCATION. The applied view lives in the server session
// and survives page loads until the session moves to another dataset — a
// dataset reused across invocations (including burn-in repeats of the same
// test) inherits whatever view the previous run applied.
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

test.beforeEach(async ({ fiftyoneLoader }) => {
  datasetName = getUniqueDatasetNameWithPrefix("view-bar");

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_samples([
        fo.Sample(
            filepath=f"/tmp/${datasetName}-{i}.png",
            index=i,
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat" if i % 2 == 0 else "dog",
                        confidence=i / 10,
                        bounding_box=[0, 0, 1, 1],
                    )
                ]
            ),
        )
        for i in range(10)
    ])
  `);
});

test.describe("view bar", () => {
  //
  // A long chain of stages scrolls INSIDE the bar: the pills overflow their
  // own scroller, the page keeps its width, the bar keeps its height, and
  // Apply stays reachable without scrolling.
  //
  test("a long view scrolls inside the bar without breaking the layout", async ({
    fiftyoneLoader,
    page,
    viewBar,
    grid,
  }) => {
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      from fiftyone import ViewField as F

      dataset = fo.load_dataset("${datasetName}")
      view = dataset
      for i in range(8):
          view = view.match(F("index") >= 0)
      dataset.save_view("long-chain", view)
    `);
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "long-chain" }),
    });

    await expect(viewBar.viewStages).toHaveCount(8);

    const bar = page.getByTestId("view-bar");
    const layout = await bar.evaluate((element) => {
      // The scroller, not its gutter wrapper: the gutter's only child is the
      // scroller's own box, which always fits, so the gutter never reports
      // the overflow being asserted
      const scroller = element.querySelector<HTMLElement>(
        "[data-cy='view-bar-scroller']",
      );
      return {
        barHeight: element.getBoundingClientRect().height,
        pillsOverflow: scroller.scrollWidth > scroller.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    // The pills overflow their scroller; the page does not grow sideways
    expect(layout.pillsOverflow).toBe(true);
    expect(layout.pageOverflow).toBe(false);
    // One-row bar: nothing wrapped or spilled vertically
    expect(layout.barHeight).toBeLessThan(48);

    // Apply is pinned outside the scroll region, visible without scrolling —
    // prove it by running the view from where the bar sits untouched
    await viewBar.viewStages.first().getByLabel("Remove stage").click();
    await expect(viewBar.applyBtn).toBeVisible();
    await grid.run(() => viewBar.applyBtn.click());
    await expect(viewBar.viewStages).toHaveCount(7);
  });

  test("a stage built in the bar reaches the session view", async ({
    fiftyoneLoader,
    page,
    viewBar,
    grid,
    request,
    baseURL,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);

    await viewBar.addStage("Limit");
    await viewBar.fill("limit", "3");

    // Armed before the click, so nothing waits on elapsed time
    await grid.run(() => viewBar.apply());

    await grid.assert.isEntryCountTextEqualTo("3 samples");

    const stages = await getSessionView(request, baseURL, datasetName);
    expect(stages).toHaveLength(1);
    expect(clsOf(stages[0])).toBe("Limit");
    expect(kwargsOf(stages[0])).toMatchObject({ limit: 3 });
  });

  //
  // The point of the whole envelope: `to_mongo()` is one-way, so a filter
  // applied from the bar could be run but never reopened as the `F(...)` it was
  // written as. The stage records the syntax beside the lowered MongoDB, and
  // reopening has to show it.
  //
  test("an expression survives being applied and reopened", async ({
    fiftyoneLoader,
    page,
    viewBar,
    grid,
    request,
    baseURL,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);

    await viewBar.addStage("FilterLabels");
    await viewBar.chooseField("field", "ground_truth");
    await viewBar.fill("filter", 'F("label") == "cat"');

    await grid.run(() => viewBar.apply());

    const stages = await getSessionView(request, baseURL, datasetName);
    expect(stages).toHaveLength(1);
    expect(clsOf(stages[0])).toBe("FilterLabels");

    await viewBar.editStage(0);
    await viewBar.assert.activeEditor("filter", "expr");
    // What reopens is the printed canonical form, not the keystrokes
    await viewBar.assert.paramText("filter", "F('label') == 'cat'");
  });

  test("a view built in Python hydrates into the bar", async ({
    page,
    fiftyoneLoader,
    viewBar,
  }) => {
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      from fiftyone import ViewField as F

      dataset = fo.load_dataset("${datasetName}")
      dataset.save_view("built-in-python", dataset.match(F("index") > 4))
    `);

    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "built-in-python" }),
    });

    await viewBar.assert.stageCount(1);
    await viewBar.assert.hasViewStage("Match");

    // An expression is an expression whoever wrote it, so it opens as Python
    await viewBar.editStage(0);
    await viewBar.assert.activeEditor("filter", "expr");
    await viewBar.assert.paramText("filter", "F('index') > 4");
  });
});
