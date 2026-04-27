## Getting Started Locally

-   Install playwright extension for VSCode.
-   Copy `.env.dev.template` into `.env.dev` and fill in the values.
-   Run `yarn` to install dependencies. Make sure you're using at least node
    18.x (preferably 20.x). `nvm install 20 && nvm use 20`.
-   Run tests directly from VSCode or from the command line with `yarn e2e`, or
    start the UI mode using `yarn e2e:ui` command. If you're using a local dev
    build, read the following section.
-   If Playwright version was upgraded, you'll need to run
    `yarn playwright install` to update the browser binaries.

### To use the local dev server of the app

-   This is useful if you want to run the tests against a local dev server of
    the app.
-   Set `export USE_DEV_BUILD=true` in `.env.dev` file.
-   Run `yarn devserver` to start the app dev server in a separate terminal
    window.
-   Proceed to run e2e tests as usual, from the CLI, VSCode, or Playwright UI.
-   **NOTE: Parallelization doesn't work with dev build.**

### Tips

1. Install the eslint extension. Also set `estlint.options` to
   `{"overrideConfigFile": "eslint.config.cjs"}` in VSCode settings to get
   linting in the editor in case it doesn't work. We use eslint's new flat
   config format, so you might have to update your eslint extension to support
   that.

### Patterns

-   Use POMs where applicable, e.g. for pages, or for common components like
    grid, modal, sidebar.
-   Do not use assertion logic directly in POMs, instead use composition to
    create POMs that contain the assertion class.
-   Refrain from using `page.waitForTimeout()`. There is almost always a better
    alternative, like using custom events.

#### Check for flakiness

If you suspect a test is flaky, you can run it multiple times to see if it
fails consistently. In the following example, the test will be run 10 times and
a summary of the results will be printed describing how many times it passed
and how many times it failed.

You may either pass the name of the spec file or the test title.

```
yarn check-flaky -r 10 -s "video plays with correct label for each slice"
```

#### Template for POMs

```typescript
class MyPOM {
    readonly semanticLocator1: Locator;
    readonly semanticLocator2: Locator;
    readonly assert: MyPOMAsserter;

    constructor(private readonly page) {
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
     * All actions should be verbs or prefixed with a verb.
     */
    async doSomeAction() {
        await this.someElement.click();
    }
}

class MyPOMAsserter {
    constructor(private readonly myPOM: MyPOM) {}

    async isFooVisible() {
        await expect(this.myPOM.someElement).toBeVisible();
    }
}
```

#### Screenshot Testing

1. Read [Playwright docs](https://playwright.dev/docs/test-snapshots) on this
   subject.
2. Since baseline screenshots are platform dependent, and our CI server runs on
   linux, to generate linux screenshots locally, run the following commands:

```
# create a docker image with playwright and python and fiftyone
yarn build-linux-screenshot-docker-image

# make sure mongod is running and available in your host machine at localhost:27017

# generate screenshots
# from e2e-pw directory, run:
docker run --rm --network host -v $(pwd):/work/ -w /work/ -it screenshot /bin/bash

# inside the docker container, run:
npx playwright test --update-snapshots -g "description of my test"

Note: `PYTHONPATH` and virtual env setup is done automatically.
```

#### Creating Datasets

Always use `DatasetFactory.createBlankDataset` when a test needs a FiftyOne
dataset. It generates blank PNG images, inserts samples directly into the
underlying MongoDB collection for performance, and applies any additional
schema fields and saved views.

```ts
import { DatasetFactory } from "src/shared/dataset-factory";

await DatasetFactory.createBlankDataset({
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

Canvas interactions must be driven imperatively using the keyboard and mouse
methods on the `SampleCanvas` POM, which is attached to the `ModalPom` as
`modal.sampleCanvas`. Do not attempt to use Playwright locators or
accessibility queries against canvas elements — the canvas is a black box from
the DOM's perspective.

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

// Click or double-click at a position
await modal.sampleCanvas.click(0.9, 0.9);
await modal.sampleCanvas.dblclick(0.9, 0.9);
```

Since the canvas surface is opaque to the DOM, the only available signals for
assertions are **screenshots** and **cursor values**. Use these to verify that
an interaction had the expected effect.

```ts
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

When writing canvas tests, move the pointer to the right edge of the viewport
before taking a screenshot to avoid hover states contaminating the baseline.

```ts
await modal.sampleCanvas.moveMouseToViewportEdge();
```

The `SampleCanvasPom` is intentionally kept free of semantic actions. Do not
add methods that encode knowledge about specific features (e.g.
`clickDetectionHandle` or `openQuickEdit`) — the sequence of keyboard and mouse
actions capture the feature in the spec. The POM provides only primitive
pointer and keyboard operations; the spec is where those primitives are
composed into meaningful interactions.

This keeps canvas testing uniform across media types. Whether a test is
targeting an image, video, or 3D sample, the interactions are expressed the
same way — `move`, `down`, `up`, `click`. Features may look different depending
on the media type, but the testing approach is identical. Writing tests this
way makes specs easier to read and collaborate on, since there is only one
pattern to learn regardless of what is being tested.

### Known Issues

#### Browser / Target has been closed

-   Most likely a missing `await` somewhere. Use VSCode eslint integration to
    get hints on missing `await`s.

#### Error: No tests found

-   This shows up randomly when running tests from VSCode. Run "Developer:
    Reload Window" to fix it.

#### Troubleshooting

The order of the steps is from the most to the least likely to fix the issue.

-   Run `yarn kill-port 8787` to kill any stray processes that might be running
    on port 8787.
-   Reload VSCode developer window.
-   Close all browser windows from previous test runs.
-   Restart the dev server.
