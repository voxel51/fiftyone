import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { clsOf, getSessionView, kwargsOf } from "src/shared/session-state";

const datasetName = getUniqueDatasetNameWithPrefix("view-bar");

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

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("view bar", () => {
  test("a stage built in the bar reaches the session view", async ({
    viewBar,
    grid,
    request,
    baseURL,
  }) => {
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
    viewBar,
    grid,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("FilterLabels");
    await viewBar.chooseField("field", "ground_truth");
    await viewBar.fill("filter", 'F("label") == "cat"');

    await grid.run(() => viewBar.apply());

    const stages = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(stages[0])).toBe("FilterLabels");

    await viewBar.editStage(0);
    await viewBar.assert.activeEditor("filter", "expr");
    await viewBar.assert.paramText("filter", 'F("label") == "cat"');
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
    await viewBar.assert.paramText("filter", 'F("index") > 4');
  });
});
