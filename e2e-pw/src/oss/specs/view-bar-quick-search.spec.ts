import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

//
// The quick search's client contract and the stages row's focus hand-off.
//
// The dataset factory registers a promptable index RUN DOCUMENT only — no
// embeddings exist, so a real search cannot execute. The submit test stubs
// the operator endpoint instead: the interesting assertions are what the
// client sends (query, index, k) and what it remembers (the history
// dropdown), not the brain backend.
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
  datasetName = getUniqueDatasetNameWithPrefix("view-bar-quick-search");

  await datasetFactory.createDataset({
    datasetName,
    numSamples: 5,
    promptableIndexes: ["clip"],
  });

  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("view bar quick search", () => {
  test("a query submits the search contract and is remembered", async ({
    viewBar,
    page,
  }) => {
    // The index exists only as a run document, so the operator must not
    // reach the real backend: answer with a well-formed error, which the
    // bar's callback uses to release the pending treatment
    await page.route("**/operators/execute", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ error: "e2e stub", error_message: "e2e stub" }),
      }),
    );

    const input = viewBar.searchInput;
    await input.click();
    await input.fill("hello world");

    // Armed before the key, so the submission is awaited, never polled
    const executeRequest = page.waitForRequest((request) =>
      request.url().includes("/operators/execute"),
    );
    await page.keyboard.press("Enter");
    const executed = (await executeRequest).postDataJSON() as Record<
      string,
      unknown
    >;

    // The stub's error settles the submission; the typed query survives it
    await expect(input).toHaveValue("hello world");

    const params = executed.params as Record<string, unknown>;
    expect(executed.operator_uri).toContain("similarity_search");
    expect(params.query).toBe("hello world");
    expect(params.brain_key).toBe("clip");
    expect(params.query_type).toBe("text");
    expect(params.apply_results).toBe(true);

    // The query was remembered at submit time: refocusing the box offers it
    await page.keyboard.press("Escape"); // clears the draft text
    await input.blur();
    await input.click();
    await expect(
      page
        .getByTestId("view-bar-search-history")
        .getByRole("option", { name: "hello world" }),
    ).toBeVisible();
  });

  test("opening the stages row focuses the typeahead and its stage list", async ({
    viewBar,
    page,
  }) => {
    await viewBar.stagesToggle.click();

    // The empty row pins its slot open as the typeahead, focused and with
    // the stage list already dropped — typing can start immediately
    await expect(viewBar.insertTypeahead).toBeFocused();
    await expect(
      page.getByRole("listbox").getByRole("option").first(),
    ).toBeVisible();
  });
});
