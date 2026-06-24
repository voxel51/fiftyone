import { expect, test as base } from "src/oss/fixtures";
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

const datasetName = getUniqueDatasetNameWithPrefix("infinite-scroll");

// a small base copied a few times (cheap, via add_collection) so the dataset
// is comfortably larger than the grid's top+bottom fetch windows (PAGE_SIZE 40
// + prefetch each end), which a single fast scroll could otherwise cover
const BASE_SIZE = 40;
const COPIES = 8;
const SAMPLE_COUNT = BASE_SIZE * COPIES;

// the sample-data endpoint (/dataset/{id}/samples) vs the id-only spine
// (/dataset/{id}/grid/samples), which is allowed to resolve every id cheaply
const isDataFetch = (url: string) =>
  url.endsWith("/samples") && !url.endsWith("/grid/samples");

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  // metadata gives every tile a fixed aspect ratio (the auto-AR grid won't
  // render lookers otherwise); build the base once, then copy it a few times
  // with new ids so seeding a few hundred samples stays fast
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    base = fo.Dataset()
    base.add_samples([
        fo.Sample(filepath=f"{i}.png", metadata=fo.ImageMetadata(width=512, height=512))
        for i in range(${BASE_SIZE})
    ])

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    for _ in range(${COPIES}):
        dataset.add_collection(base, new_ids=True)
  `);
});

test.describe.serial("virtualized infinite-scroll grid", () => {
  test("a sample far past the first page is reachable and opens", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);

    // the payoff of infinite scroll: a tile only mounted after scrolling opens
    // a real, error-free modal
    await grid.scrollBottom();
    await grid.locator
      .getByTestId("looker")
      .last()
      .click({ position: { x: 10, y: 80 } });

    await modal.verifyModalOpenedSuccessfully();
    await modal.verifyHasNoViewerError();
  });

  test("the full count resolves without fetching every sample's data", async ({
    fiftyoneLoader,
    grid,
    page,
  }) => {
    // sample indices whose DATA was requested — by id, or by an
    // [after, after+count) window
    const fetchedIds = new Set<string>();
    const fetchedRanges: Array<[number, number]> = [];
    const spineIds: string[] = [];

    page.on("response", (res) => {
      if (!res.url().endsWith("/grid/samples")) return;
      void res
        .json()
        .then((body: { spine?: { id: string }[] }) => {
          for (const entry of body.spine ?? []) {
            if (!spineIds.includes(entry.id)) spineIds.push(entry.id);
          }
        })
        .catch(() => undefined);
    });

    page.on("request", (req) => {
      if (req.method() !== "POST" || !isDataFetch(req.url())) return;
      let body: { ids?: string[]; after?: number; count?: number } | undefined;
      try {
        body = req.postDataJSON();
      } catch {
        return;
      }
      if (!body) return;
      if (body.ids?.length) {
        for (const id of body.ids) fetchedIds.add(id);
      } else if (typeof body.after === "number") {
        fetchedRanges.push([body.after, body.after + (body.count ?? 0)]);
      }
    });

    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.scrollBottom();

    // the counter shows the full total, resolved from the cheap id-only spine
    await grid.assert.isEntryCountTextEqualTo(`${SAMPLE_COUNT} samples`);
    await expect.poll(() => spineIds.length).toBe(SAMPLE_COUNT);

    const dataFetched = new Set<number>();
    for (const id of fetchedIds) {
      const index = spineIds.indexOf(id);
      if (index >= 0) dataFetched.add(index);
    }
    for (const [start, end] of fetchedRanges) {
      for (let i = start; i < Math.min(end, SAMPLE_COUNT); i++) {
        dataFetched.add(i);
      }
    }

    // some data was fetched (the test isn't vacuous)...
    expect(dataFetched.size).toBeGreaterThan(0);
    // ...but knowing there are SAMPLE_COUNT samples did NOT require fetching
    // data for all of them
    expect(dataFetched.size).toBeLessThan(SAMPLE_COUNT);
  });
});
