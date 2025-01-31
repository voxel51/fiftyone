import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("summary-fields");

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.executePythonCode(`
        import fiftyone as fo
    
        dataset = fo.Dataset("${datasetName}")
        dataset.persistent = True
        dataset.add_sample(
            fo.Sample(
                filepath=f"image.png",
                summary=fo.DynamicEmbeddedDocument(one="two", three="four"),
                summaries=[
                    fo.DynamicEmbeddedDocument(five="six", seven="eight"),
                    fo.DynamicEmbeddedDocument(nine="ten"),
                ],
            )
        )
        dataset.app_config.sidebar_groups = [
            fo.SidebarGroupDocument(
                name="summaries", paths=["summary", "summaries"], expanded=True
            )
        ]
        dataset.save()
        dataset.add_dynamic_sample_fields()
      `);
});

test.describe.serial("summary fields", () => {
  test("modal sidebar summary fields render", async ({
    eventUtils,
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.sidebar.assert.verifyObject("summary", {
      one: "two",
      three: "four",
    });
    const entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );
    await modal.sidebar.clickFieldDropdown("summaries");
    await entryExpandPromise;
    await modal.sidebar.assert.verifyObject("summaries", {
      five: "six",
      seven: "eight",
      nine: "ten",
    });
  });
});
