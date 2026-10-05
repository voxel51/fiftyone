import { Page } from "@playwright/test";
import { getPythonCommand } from "src/oss/utils/commands";
import {
  AbstractFiftyoneLoader,
  WaitUntilGridVisibleOptions,
} from "src/shared/abstract-loader";
import { EventUtils } from "src/shared/event-utils";
import { PythonRunner } from "src/shared/python-runner/python-runner";

/**
 * A grid tile's terminal states: lookers finish drawing a canvas (or report
 * an error); custom-renderer tiles are ready once their wrapper commits
 */
const MODAL_OPENED = "e2e:modal:opened";
const COUNT_SHOWN = "e2e:components:entry-count-shown";
const TILE_READY = [
  "e2e:looker:canvas-loaded",
  "e2e:looker:error-shown",
  "e2e:grid:custom-renderer-mounted",
];

export class OssLoader extends AbstractFiftyoneLoader {
  constructor() {
    super();
    this.pythonRunner = new PythonRunner(getPythonCommand);
  }

  async loadTestDataset() {
    throw new Error("Method not implemented.");
  }

  async executePythonCode(code: string) {
    return this.pythonRunner.exec(code);
  }

  async executePythonFixture() {
    throw new Error("Method not implemented.");
  }

  async selectDatasetFromSelector(page: Page, datasetName: string) {
    await page.getByTestId("selector-dataset").click();
    await page.getByTestId(`selector-result-${datasetName}`).click();
  }

  async waitUntilGridVisible(
    page: Page,
    datasetName: string,
    options?: WaitUntilGridVisibleOptions,
  ): Promise<void> {
    const { modalSample, readyEvent, searchParams, tiles } = options ?? {};
    const eventUtils = new EventUtils(page);
    await eventUtils.recordLoads();

    await page.addInitScript(() => {
      if (window.__FO_PLAYWRIGHT_INIT__) {
        return;
      }

      window.__FO_PLAYWRIGHT_INIT__ = true;

      if (!window.name.includes("__FO_PLAYWRIGHT_STORAGE_CLEARED__")) {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.name = `${window.name}__FO_PLAYWRIGHT_STORAGE_CLEARED__`;
      }

      // a user who has dismissed the one-time Enterprise intro and the
      // query performance toast
      window.localStorage.setItem("fiftyone-enterprise-tooltip-seen", "true");
      window.sessionStorage.setItem("hideQueryPerformanceToast", "true");

      const handleCursorChange = (e: MouseEvent) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        // elementFromPoint may return null (e.g. pointer outside the
        // viewport); a throw here would silently freeze the cursor flag
        // at its previous value
        if (!element) {
          return;
        }
        const cursor = window.getComputedStyle(element).cursor;
        window.__FO_PLAYWRIGHT_CURRENT_CURSOR = cursor;
      };

      document.addEventListener("mousemove", handleCursorChange);
      document.addEventListener("mousemove", handleCursorChange);
      document.addEventListener("pointerdown", handleCursorChange);
      document.addEventListener("pointerup", handleCursorChange);

      // the page fixture asserts each document showed the global loading
      // screen at most once
      const documentId = `${performance.timeOrigin}-${Math.random()}`;
      document.addEventListener("global-loading-screen", () => {
        window.__FO_GLOBAL_LOADING_SCREEN__?.(documentId);
      });

      window.IS_PLAYWRIGHT = true;
    });

    const forceDatasetFromSelector = async () => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.getByTestId("selector-dataset").click();

      if (datasetName) {
        await page.getByTestId(`selector-result-${datasetName}`).click();
      } else {
        const firstSelectorResult = page.locator(
          "[data-cy=selector-results-container] > div",
        );
        await firstSelectorResult.click();
      }
    };

    const navigate = async () => {
      const search = searchParams ? searchParams.toString() : undefined;
      if (search) {
        await page.goto(`/datasets/${datasetName}?${search}`, {
          waitUntil: "domcontentloaded",
        });
      } else {
        await page.goto(`/datasets/${datasetName}`, {
          waitUntil: "domcontentloaded",
        });
      }

      const pathname = await page.evaluate(() => window.location.pathname);
      if (pathname !== `/datasets/${datasetName}`) {
        await forceDatasetFromSelector();
      }

      const view = searchParams?.get("view");
      if (view) {
        const search = await page.evaluate(() => window.location.search);

        const params = new URLSearchParams(search);
        if (params.get("view") !== view) {
          throw new Error(`wrong view: '${params.get("view")}'`);
        }
      }
    };

    // a deep link to a sample or group opens the modal as the page loads
    const opensModal =
      (searchParams?.has("id") || searchParams?.has("groupId")) ?? false;
    const drawn = new Set<string>();
    let tileReady = false;
    let countsShown = !!readyEvent;
    let modalOpened = !opensModal;
    let modalLoaded = !modalSample;
    let ready = !readyEvent;

    await eventUtils.afterNavigation(
      [
        ...TILE_READY,
        MODAL_OPENED,
        COUNT_SHOWN,
        ...(readyEvent ? [readyEvent] : []),
      ],
      navigate,
      ({ event, detail }) => {
        const { labelsPending, mediaPending, sampleId, thumbnail } = (detail ??
          {}) as {
          labelsPending?: boolean;
          mediaPending?: boolean;
          sampleId?: string;
          thumbnail?: boolean;
        };
        if (event === readyEvent) ready = true;
        if (event === MODAL_OPENED) modalOpened = true;
        // the grid's entry counts load after its tiles
        if (event === COUNT_SHOWN) {
          countsShown ||=
            (detail as { signal: string }).signal === "grid-elements";
        }
        if (TILE_READY.includes(event)) {
          if (!tiles) tileReady = true;
          // a tile counts once it has drawn its media and all of its labels
          if (
            thumbnail &&
            !labelsPending &&
            !mediaPending &&
            event === "e2e:looker:canvas-loaded"
          ) {
            drawn.add(sampleId);
            tileReady ||= drawn.size === tiles;
          }
          if (thumbnail === false) {
            modalLoaded ||=
              event === "e2e:looker:canvas-loaded" ||
              (modalSample === "loaded-or-error" &&
                event === "e2e:looker:error-shown");
          }
        }
        return (
          (readyEvent ? ready : tileReady && countsShown) &&
          modalOpened &&
          modalLoaded
        );
      },
    );
  }
}
