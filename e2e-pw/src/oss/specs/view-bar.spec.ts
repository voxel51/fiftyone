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

test.beforeEach(async ({ datasetFactory }) => {
  datasetName = getUniqueDatasetNameWithPrefix("view-bar");

  await datasetFactory.createDataset({
    datasetName,
    numSamples: 10,
    schema: { ground_truth: "Detections" },
    withSampleData: ({ index }, { createId }) => ({
      ground_truth: {
        detections: [
          {
            _id: createId(),
            label: index % 2 === 0 ? "cat" : "dog",
            confidence: index / 10,
            bounding_box: [0, 0, 1, 1],
          },
        ],
      },
    }),
    savedViews: {
      // eight no-op stages: enough pills to overflow the bar's scroller
      "long-chain": `dataset${'.match(fo.ViewField("index") >= 0)'.repeat(8)}`,
      "built-in-python": 'dataset.match(fo.ViewField("index") > 4)',
    },
  });
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
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "long-chain" }),
    });

    // A hydrated bar starts as the collapsed summary chip
    await viewBar.expand();
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

    // Removing a stage is a finished edit: it applies on its own, no Apply
    // stop — the grid reload is the proof the removal ran
    await grid.run(() =>
      viewBar.viewStages.first().getByLabel("Remove stage").click(),
    );
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

    const editor = await viewBar.addStage("Limit");
    await editor.fill("limit", "3");

    // Committing the stage applies it — armed before the key, so nothing
    // waits on elapsed time
    await grid.run(() => editor.commit("limit"));

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

    const editor = await viewBar.addStage("FilterLabels");
    await editor.pick("field", "ground_truth");
    await editor.fill("filter", 'F("label") == "cat"');

    await grid.run(() => editor.commit("filter"));

    const stages = await getSessionView(request, baseURL, datasetName);
    expect(stages).toHaveLength(1);
    expect(clsOf(stages[0])).toBe("FilterLabels");

    const reopened = await viewBar.editStage(0);
    await reopened.assert.activeEditor("filter", "expr");
    // What reopens is the printed canonical form, not the keystrokes
    await reopened.assert.paramText("filter", "F('label') == 'cat'");
  });

  test("a view built in Python hydrates into the bar", async ({
    page,
    fiftyoneLoader,
    viewBar,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "built-in-python" }),
    });

    // A hydrated bar starts as the collapsed summary chip
    await viewBar.expand();
    await viewBar.assert.stageCount(1);
    await viewBar.assert.hasViewStage("Match");

    // An expression is an expression whoever wrote it, so it opens as Python
    const editor = await viewBar.editStage(0);
    await editor.assert.activeEditor("filter", "expr");
    await editor.assert.paramText("filter", "F('index') > 4");
  });
});
