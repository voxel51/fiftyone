import { expect, test as base } from "src/oss/fixtures";
import type { Page } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

let datasetName: string;

const test = base.extend<{ viewBar: ViewBarPom; grid: GridPom }>({
  viewBar: async ({ page }, use) => use(new ViewBarPom(page)),
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});
test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ datasetFactory, fiftyoneLoader, page }) => {
  datasetName = getUniqueDatasetNameWithPrefix("view-bar-expr");
  await datasetFactory.createDataset({
    datasetName,
    numSamples: 4,
    schema: { ground_truth: "Detections" },
    withSampleData: ({ index }, { createId }) => ({
      ground_truth: {
        detections: [
          {
            _id: createId(),
            label: index % 2 === 0 ? "cat" : "dog",
            bounding_box: [0, 0, 1, 1],
          },
        ],
      },
    }),
  });
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

//
// Completing a field hands the caret to operator territory, and the list must
// follow it there IMMEDIATELY — for both accept gestures. The mouse path once
// regressed: the row's mousedown stole Monaco's focus, and the focus-gated
// list stayed closed until the next keystroke.
//
const completeFieldAndExpectOperators = async (
  viewBar: ViewBarPom,
  page: Page,
  accept: "mouse" | "keyboard",
) => {
  const editor = await viewBar.addStage("FilterLabels");
  await editor.pick("field", "ground_truth");

  const filter = editor.param("filter");
  await filter.click();
  // Monaco mounts lazily on activation — type only once it owns the keyboard
  const monacoBox = filter.locator(".monaco-editor");
  await monacoBox.waitFor({ state: "visible" });
  await monacoBox.click();
  await page.keyboard.type('F("l');

  const suggestions = page.locator('[id^="view-bar-suggestion-"]');
  await expect(suggestions.first()).toBeVisible();
  const fieldRow = suggestions.filter({ hasText: "label" }).first();

  if (accept === "mouse") {
    await fieldRow.click();
  } else {
    await page.keyboard.press("Enter");
  }

  // the completed receiver should immediately offer operators
  await expect(filter).toContainText('F("label")', { timeout: 3000 });
  await expect(suggestions.filter({ hasText: "==" }).first()).toBeVisible({
    timeout: 3000,
  });
};

test("operator suggestions follow a mouse-completed field", async ({
  viewBar,
  page,
}) => {
  await completeFieldAndExpectOperators(viewBar, page, "mouse");
});

test("operator suggestions follow an Enter-completed field", async ({
  viewBar,
  page,
}) => {
  await completeFieldAndExpectOperators(viewBar, page, "keyboard");
});
