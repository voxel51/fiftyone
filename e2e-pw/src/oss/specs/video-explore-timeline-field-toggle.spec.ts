/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Toggling a per-frame field in the modal sidebar rebuilds the frame-label
 * stream, and the timeline sees no tracks until the new stream's index lands.
 * The timeline must hold its rows through that gap: the same root, the same
 * drawer and the same surviving rows, rather than collapsing to a header-only
 * layout and animating the drawer open again once the tracks reload.
 *
 * A screenshot cannot catch this — before and after the toggle the drawer
 * looks identical — so the assertions are on DOM node identity: an element
 * handle taken before the toggle must still be attached after it.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "video-explore-timeline-field-toggle",
);
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  // Two tracked instances on two different per-frame fields, so toggling one
  // field leaves a row that has to survive the reload.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.polylines": "Polylines",
      "frames.polylines.polylines.instance": "Instance",
    },
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({
          label: "vehicle",
          bounding_box: [0.3, 0.3, 0.2, 0.2],
          index: 1,
          instance: label.instance("vehicle-1"),
        }),
      ]),
      polylines: label.polylines([
        label.polyline({
          label: "person",
          points: [
            [
              [0.2, 0.2],
              [0.5, 0.2],
              [0.35, 0.5],
            ],
          ],
          closed: true,
          filled: false,
          index: 2,
          instance: label.instance("person-2"),
        }),
      ]),
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const TIMELINE_ROOT = "[data-timeline-loaded]";

test("toggling a frame field keeps the timeline drawer and its rows mounted", async ({
  fiftyoneLoader,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.waitForSampleLoadDomAttribute();
  const va = modal.videoAnnotate;

  // both fields are active by default: one row each
  await va.assert.objectTrackCount(2);
  await expect(page.locator(TIMELINE_ROOT)).toHaveAttribute(
    "data-timeline-loaded",
    "true",
  );

  // rows only render in the drawer body, so open it — this is also the layout
  // the close-and-reopen was visible in
  await va.openTracksDrawer();
  await va.assert.objectTrackCount(2);

  // the nodes that must survive the toggle
  const root = await page.locator(TIMELINE_ROOT).elementHandle();
  const drawer = await page
    .locator(`${TIMELINE_ROOT} > *`)
    .first()
    .elementHandle();
  const rowsBefore = await page.locator("[data-track-id]").elementHandles();
  expect(root).not.toBeNull();
  expect(drawer).not.toBeNull();
  expect(rowsBefore.length).toBeGreaterThan(0);

  const attached = async () => ({
    root: await root!.evaluate((el) => el.isConnected),
    drawer: await drawer!.evaluate((el) => el.isConnected),
    rows: await Promise.all(
      rowsBefore.map((row) => row.evaluate((el) => el.isConnected)),
    ),
  });

  // turn the polylines field off: the stream rebuilds, the polyline row goes,
  // the detection row stays put in the same drawer
  await modal.sidebar.toggleLabelCheckbox("frames.polylines");
  await va.assert.objectTrackCount(1);
  await expect(page.locator(TIMELINE_ROOT)).toHaveAttribute(
    "data-timeline-loaded",
    "true",
  );

  let after = await attached();
  expect(after.root, "timeline root was replaced").toBe(true);
  expect(after.drawer, "timeline drawer was replaced").toBe(true);
  expect(
    after.rows.filter(Boolean).length,
    "the row for the still-active field was replaced",
  ).toBeGreaterThan(0);
  const survivors = rowsBefore.filter((_, i) => after.rows[i]);

  // and back on: the stream rebuilds again, still without a remount, and the
  // detection row that was held is the very same node
  await modal.sidebar.toggleLabelCheckbox("frames.polylines");
  await va.assert.objectTrackCount(2);
  await expect(page.locator(TIMELINE_ROOT)).toHaveAttribute(
    "data-timeline-loaded",
    "true",
  );

  after = await attached();
  expect(after.root, "timeline root was replaced").toBe(true);
  expect(after.drawer, "timeline drawer was replaced").toBe(true);
  for (const row of survivors) {
    expect(
      await row.evaluate((el) => el.isConnected),
      "a held row was replaced when its field set reloaded",
    ).toBe(true);
  }
});
