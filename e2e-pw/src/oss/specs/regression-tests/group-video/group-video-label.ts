import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("video-label-regression");
const testVideoPath1 = "/tmp/test-video1.mp4";
const testVideoPath2 = "/tmp/test-video2.mp4";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
});

test.describe("quickstart-groups", () => {
  test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
    [testVideoPath1, testVideoPath2].forEach((outputPath) => {
      mediaFactory.createBlankVideo({
        outputPath,
        duration: 5,
        width: 100,
        height: 100,
        frameRate: 30,
      });
    });

    await fiftyoneLoader.executePythonCode(
      `
      import fiftyone as fo
      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True
      dataset.add_group_field("group", default="v1")

      group = fo.Group()
      sample1 = fo.Sample(filepath="${testVideoPath1}", group=group.element("v1"))
      sample2 = fo.Sample(filepath="${testVideoPath2}", group=group.element("v2"))

      dataset.add_samples([sample1, sample2])
      `
    );
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("should have four lookers with 'left' as default slice", async ({
    grid,
    page,
  }) => {});
});
