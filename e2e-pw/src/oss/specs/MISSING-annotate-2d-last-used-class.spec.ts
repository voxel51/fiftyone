/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Last-used class propagation: after changing a drawn detection's class in the
 * sidebar form, the NEXT drawn detection defaults to that class. Regression for
 * a step-3 defect where the form's class edit reached the engine but never the
 * surface-owned draft slot, so the next draw kept the OLD default class
 * (fixed in AnnotationSchema.tsx: sync the draft slot on commit when isNew).
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-last-used-class");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { detections: "Detections" },
    withSampleData: (_, { createId }) => ({
      detections: {
        detections: [
          { _id: createId(), label: "cat", bounding_box: [0.4, 0.4, 0.2, 0.2] },
        ],
      },
    }),
  });

  await annotateSDK.updateLabelSchema(datasetName, "detections", {
    type: "detections",
    classes: ["cat", "dog"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.waitForSampleLoadDomAttribute();
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
});

/** Draw a detection box across the given relative corners (annotate mode). */
const drawBox = async (
  modal: ModalPom,
  from: [number, number],
  to: [number, number]
) => {
  await modal.sidebar.annotate.detectionMode("Detections");
  await modal.sampleCanvas.move(from[0], from[1], "crosshair");
  await modal.sampleCanvas.down();
  await modal.sampleCanvas.move(to[0], to[1]);
  await modal.sampleCanvas.up();
};

test("a changed class becomes the default for the next drawn detection", async ({
  modal,
}) => {
  // draw the first box and switch its class to "dog"
  await drawBox(modal, [0.7, 0.7], [0.85, 0.85]);
  await modal.sidebar.edit.selectFieldChoice("label", "dog");
  await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
  await modal.sidebar.edit.exitToList();

  // the next drawn box should default to the last-used class ("dog"), not "cat"
  await drawBox(modal, [0.1, 0.1], [0.25, 0.25]);
  await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
});
