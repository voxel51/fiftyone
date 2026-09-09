/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Video annotation on a GROUPED dataset (an image slice + a video slice):
 *
 *  - the Annotate tab is available and the video slice mounts the video
 *    annotation surface (guards the grouped-video gating + the ModalLooker /
 *    engine-store fixes — a grouped video slice is decided per-sample, not from
 *    the dataset-level media type);
 *  - the per-slice schema filter narrows the dataset-wide active schema to what
 *    the open slice supports: the video slice offers frame detections +
 *    sample-level classification + temporal detections but NOT sample-level
 *    spatial detections; the image slice offers sample-level detections +
 *    classification but NOT frame fields or temporal detections;
 *  - editing in EACH slice writes to THAT slice's own sample — the guard against
 *    the sample-scope regression (a surface resolving its sample via the ambient
 *    sole store throws / mis-scopes once a grouped modal registers a second
 *    store; every surface must scope to its own sample).
 *
 * One group: image slice (`image`) + video slice (`video`, the default). Fixed
 * sample ids so an edit's autosave PATCH can be checked against the slice it
 * must land on. Re-seeded per test so a persisting edit can't leak into the next.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-grouped-video");
const videoId = "000000000000000000000000";
const imageId = "000000000000000000000001";
const clip = `/tmp/${datasetName}.webm`;
const image = `/tmp/${datasetName}.png`;

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
});

const seedCode = `
import fiftyone as fo
from bson import ObjectId

DET = ["vehicle", "person", "road sign"]
CLS = ["sunny", "rainy", "night"]
EVT = ["approach", "pass", "depart"]

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

d = fo.Dataset("${datasetName}")
d.persistent = True
d.add_group_field("group", default="video")
# register the slices explicitly: the raw insert below (for forced ids) bypasses
# the schema expansion add_samples would do, so group_media_types would be empty
d.add_group_slice("image", "image")
d.add_group_slice("video", "video")

# forced ids so an edit's PATCH can be checked against the slice's sample
group = fo.Group()
samples = [
    fo.Sample(_id=ObjectId("${imageId}"), filepath="${image}", group=group.element("image")),
    fo.Sample(_id=ObjectId("${videoId}"), filepath="${clip}", group=group.element("video")),
]
d._sample_collection.insert_many([d._make_dict(s, include_id=True) for s in samples])
d.reload()

d.compute_metadata()
# materialize per-frame images for the video slice (writes frames.filepath)
d.select_group_slices("video").to_frames(sample_frames=True)

d.add_frame_field("detections", fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections)
d.add_frame_field("detections.detections.keyframe", fo.BooleanField)
d.add_frame_field("detections.detections.propagation", fo.DictField)
d.add_sample_field("detections", fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections)
d.add_sample_field("classification", fo.EmbeddedDocumentField, embedded_doc_type=fo.Classification)
d.add_sample_field("events", fo.EmbeddedDocumentField, embedded_doc_type=fo.TemporalDetections)

# video slice: a per-frame tracked detection (frames.detections) across all
# frames + sample-level detections/classification/events. The sample-level
# detection is present but must be FILTERED OUT of the video annotate schema.
d.group_slice = "video"
vid = d.first()
n = int(vid.metadata.total_frame_count)
inst = fo.Instance()
for fn in range(1, n + 1):
    vid.frames[fn]["detections"] = fo.Detections(
        detections=[
            fo.Detection(
                label="vehicle",
                bounding_box=[0.3, 0.3, 0.2, 0.2],
                index=1,
                instance=inst,
            )
        ]
    )
vid["detections"] = fo.Detections(
    detections=[fo.Detection(label="vehicle", bounding_box=[0.25, 0.25, 0.4, 0.4], index=1)]
)
vid["classification"] = fo.Classification(label="sunny")
a = max(1, n // 3)
b = max(a + 1, (2 * n) // 3)
vid["events"] = fo.TemporalDetections(
    detections=[
        fo.TemporalDetection(label="approach", support=[1, a]),
        fo.TemporalDetection(label="pass", support=[a + 1, b]),
        fo.TemporalDetection(label="depart", support=[b + 1, n]),
    ]
)
vid.save()

# image slice: a sample-level detection + classification
d.group_slice = "image"
img = d.first()
img["detections"] = fo.Detections(
    detections=[fo.Detection(label="vehicle", bounding_box=[0.25, 0.25, 0.4, 0.4], index=1)]
)
img["classification"] = fo.Classification(label="rainy")
img.save()


def schema(kind, classes, extra=None):
    return {
        "type": kind,
        "component": "dropdown",
        "attributes": [
            {"name": "id", "type": "id", "component": "text", "read_only": True}
        ]
        + (extra or []),
        "classes": classes,
    }


idx = [{"name": "index", "type": "int", "component": "text"}]
d.update_label_schema("frames.detections", schema("detections", DET, idx), allow_new_attrs=True)
d.update_label_schema("detections", schema("detections", DET, idx), allow_new_attrs=True)
d.update_label_schema("classification", schema("classification", CLS), allow_new_attrs=True)
d.update_label_schema("events", schema("temporaldetections", EVT), allow_new_attrs=True)
d.active_label_schemas = ["frames.detections", "detections", "classification", "events"]
d.save()
`;

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 5,
    color: "#3050a0",
  });
  await mediaFactory.createImage({
    outputPath: image,
    width: 64,
    height: 64,
    fillColor: "#a03050",
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
  await fiftyoneLoader.executePythonCode(seedCode);
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  // serial describe shares one page; close any modal a prior test left open so
  // openFirstSample's grid click below isn't intercepted
  await modal.close({ ignoreError: true });
});

/**
 * Open the first group (its default slice is `video`) and enter annotate mode
 * on the video surface. Opening from the grid (vs a deep link) loads the full
 * group so its slice membership resolves — the annotation slice selector needs
 * it.
 */
const enterVideoAnnotate = async (grid: GridPom, modal: ModalPom) => {
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

test.describe.serial("grouped video annotation", () => {
  test("the video slice mounts the video annotation surface", async ({
    grid,
    modal,
  }) => {
    // gating + surface mount: entering annotate on a grouped video slice must
    // reach the video surface (not fall back to the image renderer) and must
    // not throw on store registration
    await enterVideoAnnotate(grid, modal);
  });

  test("the video slice offers frame + classification + temporal schemas, not sample detections", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    await expect
      .poll(() => modal.videoAnnotate.listedLabelPaths())
      .toEqual(
        expect.arrayContaining([
          "frames.detections",
          "classification",
          "events",
        ]),
      );

    // the sample-level `detections` field is filtered out on a video slice
    // (spatial sample-level labels live in `frames.*` on video)
    expect(await modal.videoAnnotate.listedLabelPaths()).not.toContain(
      "detections",
    );
  });

  test("the image slice offers sample detections + classification, not frame or temporal schemas", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.waitForLighterReady();

    await expect
      .poll(() => modal.videoAnnotate.listedLabelPaths())
      .toEqual(expect.arrayContaining(["detections", "classification"]));

    const paths = await modal.videoAnnotate.listedLabelPaths();
    expect(paths).not.toContain("frames.detections");
    expect(paths).not.toContain("events");
  });

  test("the annotation slice selector offers both the video and image slices", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    const slices = (
      await modal.sidebar.annotate.getAvailableAnnotationSlices()
    ).map((s) => s.trim());
    expect(slices).toContain("image");
    expect(slices).toContain("video");
  });

  test("editing on the video slice writes to the video sample", async ({
    grid,
    modal,
    page,
  }) => {
    // the sample-scope guard: selecting + editing a track on a grouped video
    // slice drives the exact path that regressed (surface actions resolving the
    // sample), and the autosave must PATCH the VIDEO sample — not the image one.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await enterVideoAnnotate(grid, modal);

    await modal.videoAnnotate.assert.labelListed("vehicle");
    await modal.videoAnnotate.selectLabel("vehicle");
    // the editor opened => select() didn't throw resolving its sample scope
    await expect(modal.sidebar.edit.backButton).toBeVisible();

    const patch = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    const response = await patch;

    // scoped to the video sample
    expect(response.url()).toContain(videoId);
    expect(response.url()).not.toContain(imageId);
    await expect
      .poll(async () =>
        Number(await modal.sidebar.edit.getFieldValue("position.x")),
      )
      .toBeCloseTo(0.5, 4);

    expect(pageErrors).toEqual([]);
  });

  test("editing on the image slice writes to the image sample", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.waitForLighterReady();

    await modal.videoAnnotate.assert.labelListed("vehicle");
    await modal.videoAnnotate.selectLabel("vehicle");
    await expect(modal.sidebar.edit.backButton).toBeVisible();

    const patch = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    const response = await patch;

    // scoped to the image sample
    expect(response.url()).toContain(imageId);
    expect(response.url()).not.toContain(videoId);
  });
});
