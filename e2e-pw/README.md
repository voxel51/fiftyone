## Getting Started Locally

- Install playwright extension for VSCode.
- Copy `.env.dev.template` into `.env.dev` and fill in the values.
- Run `yarn` to install dependencies. Make sure you're using at least node 18.x
  (preferably 20.x). `nvm install 20 && nvm use 20`.
- Run tests directly from VSCode or from the command line with `yarn e2e`, or
  start the UI mode using `yarn e2e:ui` command. If you're using a local dev
  build, read the following section.
- If Playwright version was upgraded, you'll need to run
  `yarn playwright install` to update the browser binaries.

### To use the local dev server of the app

- This is useful if you want to run the tests against a local dev server of the
  app.
- Set `export USE_DEV_BUILD=true` in `.env.dev` file.
- Run `yarn devserver` to start the app dev server in a separate terminal
  window.
- Proceed to run e2e tests as usual, from the CLI, VSCode, or Playwright UI.
- **NOTE: Parallelization doesn't work with dev build.**

### Tips

1. Install the eslint extension. Also set `estlint.options` to
   `{"overrideConfigFile": "eslint.config.cjs"}` in VSCode settings to get
   linting in the editor in case it doesn't work. We use eslint's new flat
   config format, so you might have to update your eslint extension to support
   that.

### Spec Organization

All specs live directly in `e2e-pw/src/oss/specs/` with no subdirectories and
are named `<short-description>.spec.ts`, e.g. `my-regression-test.spec.ts`.

### Rules

`CODING_STANDARDS.md` is binding for every spec, POM and App `e2e:` event:
waits, POM structure, test size, datasets, canvas testing and screenshots. CI's
`e2e-waits` job enforces its wait rules.

#### Check for flakiness

If you suspect a test is flaky, you can run it multiple times to see if it
fails consistently. In the following example, the test will be run 10 times and
a summary of the results will be printed describing how many times it passed
and how many times it failed.

You may either pass the name of the spec file or the test title.

```
yarn check-flaky -r 10 -s "video plays with correct label for each slice"
```

#### POM template

```typescript
class MyPOM {
    readonly semanticLocator1: Locator;
    readonly semanticLocator2: Locator;
    readonly assert: MyPOMAsserter;

    constructor(
        private readonly page: Page,
        private readonly eventUtils: EventUtils,
    ) {
        this.semanticLocator1 = this.page.locator("...");
        this.semanticLocator2 = this.page.locator("...");
        this.assert = new MyPOMAsserter(this);
    }

    /**
     * All methods that return static locators should be decorated with `get`.
     */
    get someElement() {
        return this.page.locator("...");
    }

    /**
     * All methods that return dynamic locators should be prefixed with `get`.
     */
    getMyElement(param: string) {
        return this.page.locator(`...${param}...`);
    }

    /**
     * All actions should be verbs or prefixed with a verb, and resolve on the
     * `e2e:` event they cause.
     */
    async doSomeAction() {
        await this.eventUtils.after("e2e:my-component:shown", () =>
            this.someElement.click(),
        );
    }
}

class MyPOMAsserter {
    constructor(private readonly myPOM: MyPOM) {}

    /** One exact read, after the action that changed it resolved */
    async hasFooText(text: string) {
        expect(await this.myPOM.someElement.textContent()).toBe(text);
    }
}
```

#### Screenshot Testing

1. Read [Playwright docs](https://playwright.dev/docs/test-snapshots) on this
   subject.
2. Baseline screenshots are platform dependent. CI compares the
   `*-chromium-linux.png` baselines rendered inside the CI container image
   (`ghcr.io/voxel51/fiftyone-e2e`); other environments' font stacks differ by
   pixels, so only that image's renders are canonical. To update a linux
   baseline, harvest the render from a CI run of your PR:

```
# download the failing run's blob reports and merge them to JSON
gh run download <run-id> -p 'e2e-blob-shard-*' -D /tmp/blobs
mkdir -p /tmp/all && find /tmp/blobs -name '*.zip' -exec cp {} /tmp/all/ \;
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/merged.json \
  npx playwright merge-reports --reporter json /tmp/all

# each failed test's first attempt attaches <name>-actual.png with a local
# path; commit it over the baseline:
cp <attachment path> \
  src/oss/specs/<spec>.spec.ts-snapshots/<name>-chromium-linux.png
```

A test stops at its first mismatched screenshot but writes every missing one,
so delete a spec's stale linux baselines to collect them all in one round.

#### Creating Datasets

`DatasetFactory.createDataset` is discriminated on `mediaType` (`"image"` by
default, or `"video"`, `"3d"`, `"group"`, `"multimodal"`), generates the media
for that kind, inserts samples directly into the underlying MongoDB collection
for performance, and applies any additional schema fields and saved views.

```ts
import { DatasetFactory } from "src/shared/dataset-factory";

await DatasetFactory.createDataset({
    datasetName: "my-test-dataset",
    numSamples: 5,
    numbered: true,
    schema: {
        ground_truth: "Detection",
        uniqueness: "FloatField",
    },
    // Optional: customize generated image size and fill color.
    // Defaults to { fillColor: "white", width: 50, height: 50 }.
    imageOptions: {
        fillColor: "#ff0000",
        width: 100,
        height: 100,
    },
    withSampleData: ({ _id, filepath, index }, { createId }) => ({
        // _id, filepath, index are already attached to the sample
        ground_truth: {
            _cls: "Detection",
            label: "cat",
            bounding_box: [0.1, 0.1, 0.5, 0.5],
            confidence: 0.9,
        },
        uniqueness: 0.97,
    }),
});
```

Every `mediaType` takes the same `schema`, `labelSchemas`, `withSampleData` and
`savedViews` options; they differ in the media generated per sample
(`videoOptions`, `sceneOptions`, `imageOptions` — each an object or a function
of the sample index) and in the scaffold `withSampleData` receives. The
`mediaType` literal narrows the accepted options, so `videoOptions` on an image
dataset is a type error. A video dataset declares frame fields with a `frames.`
prefix in `schema`, populates frames through `withFrameData(frame, helpers)`
(called once per sample and frame number) and materializes frame images with
`sampleFrames: true`. `helpers.mask(width, height)` serializes an all-ones
numpy mask.

Every attribute a `withSampleData`/`withFrameData` document carries must be
declared in `schema`, including dynamic label attributes such as a cuboid's
`detections.detections.location` (`"ListField<FloatField>"`) or a polyline's
`points3d` (`"ListField<ListField<ListField<FloatField>>>"`); seeding fails
with the undeclared paths and their inferred types otherwise.

```ts
await DatasetFactory.createDataset({
    mediaType: "video",
    datasetName: "my-video-dataset",
    videoOptions: { duration: 4 },
    schema: { "frames.detections": "Detections" },
    withFrameData: (_, { createId }) => ({
        detections: {
            _cls: "Detections",
            detections: [{ _id: createId(), _cls: "Detection", label: "cat" }],
        },
    }),
    sampleFrames: true,
});
```

Group slices may be `image`, `3d` or `video` (with per-slice media options);
video slices take `withFrameData` and `sampleFrames` too. Recipes shared by a
spec family (the video-annotation and 3D seeds) live beside the specs in
`src/oss/specs/annotate-*/`.

Each sample is automatically assigned a stable, index-derived `_id` of the form
`000000000000000000000000` (zero-padded 24-character hex). This makes it easy
to reference samples by ID in assertions. Use the `indexToId` helper to derive
an ID from a sample's index.

```ts
import { indexToId } from "src/shared/utils";

const firstSampleId = indexToId(0); // "000000000000000000000000"
```

If your test is only concerned with modal features and doesn't need to exercise
grid navigation, you can skip clicking through the grid by navigating directly
to the dataset filtered to a single sample using its stable ID. Pass the ID as
an `id` search param to `waitUntilGridVisible` — the modal will open
immediately on that sample.

```ts
await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: indexToId(0) }),
});
```

#### Canvas Testing

`modal.sampleCanvas` spans the modal's sample; `modal.sampleCanvas3d`,
`modal.groupSampleCanvas` and `modal.episode.canvas(tile)` are the same POM
rooted at the 3D viewer, a group modal's 2D pane and an episode surface.

```ts
// Move the pointer to a canvas-relative position (0–1 in both axes)
await modal.sampleCanvas.move(0.5, 0.5);

// Optionally, assert a cursor value change on move
await modal.sampleCanvas.move(0.9, 0.9, "grab");

// Move the pointer by a pixel offset relative to its current position
await modal.sampleCanvas.movePixels(10, -5);
await modal.sampleCanvas.movePixels(10, -5, "grab"); // with optional cursor assertion

// Press and release the mouse button
await modal.sampleCanvas.down();
await modal.sampleCanvas.up();

// Press a key with the canvas focused
await modal.sampleCanvas3d.press("Enter");

// Click or double-click at a position
await modal.sampleCanvas.click(0.9, 0.9);
await modal.sampleCanvas.dblclick(0.9, 0.9);

// Assert the CSS cursor at the current pointer position
await modal.sampleCanvas.assert.hasCursor("default");
await modal.sampleCanvas.assert.hasCursor("nwse-resize");

// Assert the canvas state via screenshot
await modal.sampleCanvas.assert.hasScreenshot("my-test-state.png");

// Assert the canvas type
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER3D);
```

### Known Issues

#### Browser / Target has been closed

- Most likely a missing `await` somewhere. Use VSCode eslint integration to get
  hints on missing `await`s.

#### Error: No tests found

- This shows up randomly when running tests from VSCode. Run "Developer: Reload
  Window" to fix it.

#### Troubleshooting

The order of the steps is from the most to the least likely to fix the issue.

- Run `yarn kill-port 8787` to kill any stray processes that might be running
  on port 8787.
- Reload VSCode developer window.
- Close all browser windows from previous test runs.
- Restart the dev server.
