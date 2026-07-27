import type { Page } from "src/oss/fixtures";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { clsOf, getSessionView, kwargsOf } from "src/shared/session-state";

const datasetName = getUniqueDatasetNameWithPrefix("view-bar-stages");
const groupDatasetName = getUniqueDatasetNameWithPrefix("view-bar-groups");

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

test.beforeAll(async ({ fiftyoneLoader, foWebServer, datasetFactory }) => {
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

  await datasetFactory.createGroupDataset({
    datasetName: groupDatasetName,
    numGroups: 3,
    slices: [
      { name: "left", mediaType: "image" },
      { name: "right", mediaType: "image" },
    ],
  });
});

/**
 * Saves `view` on the dataset from Python and loads the App on it, so the bar
 * hydrates from a view it did not build. `slug` is what the App navigates to.
 */
const loadSavedView = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  page: Page,
  name: string,
  slug: string,
  expression: string,
  dataset = datasetName,
) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    from fiftyone import ViewField as F

    dataset = fo.load_dataset("${dataset}")
    dataset.delete_saved_views()
    dataset.save_view("${name}", ${expression})
  `);

  await fiftyoneLoader.waitUntilGridVisible(page, dataset, {
    searchParams: new URLSearchParams({ view: slug }),
  });
};

test.describe("view bar: bar → session", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("Limit", async ({ viewBar, grid, page, request, baseURL }) => {
    await viewBar.addStage("Limit");
    await viewBar.fill("limit", "3");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(view.map(clsOf)).toEqual(["Limit"]);
    expect(kwargsOf(view[0])).toEqual({ limit: 3 });
    await grid.assert.isEntryCountTextEqualTo("3 samples");
    await expect(page.getByTestId("view-bar")).toContainText("Limit");
  });

  test("Skip", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("Skip");
    await viewBar.fill("skip", "4");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(kwargsOf(view[0])).toEqual({ skip: 4 });
    await grid.assert.isEntryCountTextEqualTo("6 samples");
  });

  test("Take", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("Take");
    await viewBar.fill("size", "2");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Take");
    expect(kwargsOf(view[0]).size).toBe(2);
    await grid.assert.isEntryCountTextEqualTo("2 samples");
  });

  test("Shuffle", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("Shuffle");
    await viewBar.fill("seed", "51");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Shuffle");
    expect(kwargsOf(view[0]).seed).toBe(51);
    await grid.assert.isEntryCountTextEqualTo("10 samples");
  });

  test("SortBy", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("SortBy");
    await viewBar.chooseField("field_or_expr", "index");
    await viewBar.setToggle("reverse", true);

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("SortBy");
    expect(kwargsOf(view[0])).toMatchObject({
      field_or_expr: "index",
      reverse: true,
    });
  });

  test("Exists", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("Exists");
    await viewBar.chooseField("field", "sometimes");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Exists");
    expect(kwargsOf(view[0]).field).toBe("sometimes");
    await grid.assert.isEntryCountTextEqualTo("5 samples");
  });

  test("MatchTags", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("MatchTags");
    await viewBar.fill("tags", "even");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("MatchTags");
    expect(kwargsOf(view[0]).tags).toEqual(["even"]);
    await grid.assert.isEntryCountTextEqualTo("5 samples");
  });

  test("SelectFields", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("SelectFields");
    await viewBar.chooseField("field_names", "score");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("SelectFields");
    expect(kwargsOf(view[0]).field_names).toEqual(["score"]);
  });

  test("ExcludeFields", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("ExcludeFields");
    await viewBar.chooseField("field_names", "score");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("ExcludeFields");
    expect(kwargsOf(view[0]).field_names).toEqual(["score"]);
  });

  test("LimitLabels", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("LimitLabels");
    await viewBar.chooseField("field", "ground_truth");
    await viewBar.fill("limit", "1");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("LimitLabels");
    expect(kwargsOf(view[0])).toMatchObject({
      field: "ground_truth",
      limit: 1,
    });
  });

  test("ToPatches", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("ToPatches");
    await viewBar.chooseField("field", "ground_truth");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("ToPatches");
    expect(kwargsOf(view[0]).field).toBe("ground_truth");
    await grid.assert.isEntryCountTextEqualTo("20 patches");
  });

  test("GroupBy", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("GroupBy");
    await viewBar.chooseField("field_or_expr", "label");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("GroupBy");
    expect(kwargsOf(view[0]).field_or_expr).toBe("label");
  });

  test("Match sends an expression envelope, not lowered mongo", async ({
    viewBar,
    grid,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("Match");
    await viewBar.fill("filter", 'F("index") > 4');

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("Match");
    // The server decodes the envelope, so what lands in the view is a real
    // filter rather than the `{"_fo_expr": ...}` the bar sent
    expect(kwargsOf(view[0]).filter).toBeTruthy();
    await grid.assert.isEntryCountTextEqualTo("5 samples");
  });

  test("FilterLabels", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("FilterLabels");
    await viewBar.chooseField("field", "ground_truth");
    await viewBar.fill("filter", 'F("label") == "cat"');

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("FilterLabels");
    expect(kwargsOf(view[0]).field).toBe("ground_truth");
    expect(kwargsOf(view[0]).filter).toBeTruthy();
  });

  test("FilterField", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("FilterField");
    await viewBar.chooseField("field", "score");
    await viewBar.fill("filter", 'F("score") > 0.5');

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("FilterField");
    expect(kwargsOf(view[0]).field).toBe("score");
  });

  test("SetField", async ({ viewBar, grid, request, baseURL }) => {
    await viewBar.addStage("SetField");
    await viewBar.chooseField("field", "score");
    await viewBar.fill("expr", 'F("index") * 2');

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(clsOf(view[0])).toBe("SetField");
    expect(kwargsOf(view[0]).field).toBe("score");
  });

  test("two stages apply in bar order", async ({
    viewBar,
    grid,
    request,
    baseURL,
  }) => {
    await viewBar.addStage("Skip");
    await viewBar.fill("skip", "2");
    await viewBar.addStage("Limit");
    await viewBar.fill("limit", "3");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, datasetName);
    expect(view.map(clsOf)).toEqual(["Skip", "Limit"]);
    await grid.assert.isEntryCountTextEqualTo("3 samples");
  });
});

test.describe("view bar: session → bar", () => {
  test("Limit hydrates into its numeric control", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "limit view",
      "limit-view",
      "dataset.limit(3)",
    );

    await viewBar.assert.stageCount(1);
    await viewBar.assert.hasViewStage("Limit");
    await viewBar.editStage(0);
    await viewBar.assert.paramText("limit", "3");
  });

  test("SortBy hydrates the field into the picker and the flag into its toggle", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "sort view",
      "sort-view",
      "dataset.sort_by('index', reverse=True)",
    );

    await viewBar.editStage(0);
    await viewBar.assert.activeEditor("field_or_expr", "field");
    await viewBar.assert.paramField("field_or_expr", "index");
    await viewBar.assert.paramToggle("reverse", true);
  });

  test("Exists hydrates the field into the picker", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "exists view",
      "exists-view",
      "dataset.exists('sometimes')",
    );

    await viewBar.editStage(0);
    await viewBar.assert.activeEditor("field", "field");
    await viewBar.assert.paramField("field", "sometimes");
  });

  test("MatchTags hydrates its list into the text control", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "tags view",
      "tags-view",
      "dataset.match_tags(['even'])",
    );

    await viewBar.editStage(0);
    await viewBar.assert.paramText("tags", "even");
  });

  test("SelectFields hydrates into the multi-field picker", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "select view",
      "select-view",
      "dataset.select_fields('score')",
    );

    await viewBar.editStage(0);
    await viewBar.assert.activeEditor("field_names", "fields");
    await viewBar.assert.paramField("field_names", "score");
  });

  test("LimitLabels hydrates both of its params", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "limit labels view",
      "limit-labels-view",
      "dataset.limit_labels('ground_truth', 1)",
    );

    await viewBar.editStage(0);
    await viewBar.assert.paramField("field", "ground_truth");
    await viewBar.assert.paramText("limit", "1");
  });

  test("ToPatches hydrates its label field", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "patches view",
      "patches-view",
      "dataset.to_patches('ground_truth')",
    );

    await viewBar.editStage(0);
    await viewBar.assert.paramField("field", "ground_truth");
  });

  test("GroupBy hydrates its field", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "group view",
      "group-view",
      "dataset.group_by('label')",
    );

    await viewBar.editStage(0);
    await viewBar.assert.paramField("field_or_expr", "label");
  });

  test("a Python-built Match opens as Python, not as lowered mongo", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "match view",
      "match-view",
      "dataset.match(F('index') > 4)",
    );

    await viewBar.editStage(0);
    // `_serialize` records the envelope beside the lowered MongoDB for any
    // reconstructible expression, whoever built it, so a view written in
    // Python reopens in the editor it was written in
    await viewBar.assert.activeEditor("filter", "expr");
    await viewBar.assert.paramText("filter", 'F("index") > 4');
  });

  test("a two-stage view hydrates both cards in order", async ({
    viewBar,
    fiftyoneLoader,
    page,
  }) => {
    await loadSavedView(
      fiftyoneLoader,
      page,
      "chain view",
      "chain-view",
      "dataset.skip(2).limit(3)",
    );

    await viewBar.assert.stageCount(2);
    await expect(viewBar.viewStages.nth(0)).toContainText("Skip");
    await expect(viewBar.viewStages.nth(1)).toContainText("Limit");
  });
});

test.describe("view bar: group stages", () => {
  test("SelectGroupSlices round trips", async ({
    viewBar,
    grid,
    page,
    request,
    baseURL,
    fiftyoneLoader,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, groupDatasetName);

    await viewBar.addStage("SelectGroupSlices");
    await viewBar.fill("slices", "left");

    await grid.run(() => viewBar.apply());

    const view = await getSessionView(request, baseURL, groupDatasetName);
    expect(clsOf(view[0])).toBe("SelectGroupSlices");
    expect(kwargsOf(view[0]).slices).toEqual(["left"]);

    await loadSavedView(
      fiftyoneLoader,
      page,
      "slices view",
      "slices-view",
      "dataset.select_group_slices(['left'])",
      groupDatasetName,
    );
    await viewBar.editStage(0);
    await viewBar.assert.paramText("slices", "left");
  });
});

// Video stages need a video dataset. The factory has no video creator wired
// into `DatasetFactory`, and the precedent for video specs is the
// `quickstart-video` zoo dataset, which is a download this suite should not
// take on for a bar test. Covering these means adding a video dataset creator
// to the factory on top of `MediaFactory.createVideo`.
test.describe
  .skip("view bar: video stages (needs a video dataset fixture)", () => {
  test("ToClips", async () => {});
  test("ToFrames", async () => {});
  test("ToTrajectories", async () => {});
  test("MatchFrames", async () => {});
});
