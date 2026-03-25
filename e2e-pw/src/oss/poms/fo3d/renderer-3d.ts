import { Locator, Page } from "src/oss/fixtures";
import { Asset3dPanelPom } from "src/oss/poms/fo3d/assets-panel";

export type CameraPosition = [number, number, number];

type SavedCameraState = {
  position: number[];
  target: number[];
};

const SAVED_CAMERA_STATE_VALIDATOR_BODY = `
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.position) &&
      parsed.position.length === 3 &&
      Array.isArray(parsed?.target) &&
      parsed.target.length === 3
      ? parsed
      : null;
  } catch {
    return null;
  }
`;

export function positionsAreClose(
  a: CameraPosition,
  b: CameraPosition,
  tolerance = 0.5
): boolean {
  return (
    Math.abs(a[0] - b[0]) < tolerance &&
    Math.abs(a[1] - b[1]) < tolerance &&
    Math.abs(a[2] - b[2]) < tolerance
  );
}

export class Renderer3dPom {
  readonly asset3dPanel: Asset3dPanelPom;
  readonly modalLookerContainer: Locator;
  readonly looker3d: Locator;
  readonly statusBar: Locator;
  readonly statusBarToggle: Locator;
  readonly statusBarClose: Locator;
  readonly statusBarCameraPosition: Locator;

  constructor(private readonly page: Page) {
    this.asset3dPanel = new Asset3dPanelPom(this.page);
    this.modalLookerContainer = this.page.getByTestId("modal-looker-container");
    this.looker3d = this.modalLookerContainer.getByTestId("looker3d");
    this.statusBar =
      this.modalLookerContainer.getByTestId("looker3d-statusbar");
    this.statusBarToggle = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-toggle"
    );
    this.statusBarClose = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-close"
    );
    this.statusBarCameraPosition = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-camera-position"
    );
  }

  async openStatusBar() {
    if (await this.statusBar.isVisible()) {
      return;
    }

    await this.statusBarToggle.waitFor({ state: "visible" });
    await this.statusBarToggle.click();
    await this.statusBar.waitFor({ state: "visible" });
  }

  async closeStatusBar() {
    if (!(await this.statusBar.isVisible())) {
      return;
    }

    await this.statusBarClose.click();
    await this.statusBar.waitFor({ state: "hidden" });
  }

  async getCameraPosition(): Promise<CameraPosition> {
    await this.openStatusBar();
    await this.statusBarCameraPosition.waitFor({ state: "visible" });

    const text = await this.statusBarCameraPosition.textContent();
    if (!text) {
      throw new Error("Camera position text is empty");
    }

    return this.parseCameraPosition(text);
  }

  async getSavedCameraState(
    datasetName: string
  ): Promise<SavedCameraState | null> {
    return this.page.evaluate(
      ({ name, validatorBody }) => {
        const validateSavedCameraState = new Function("raw", validatorBody);

        return validateSavedCameraState(
          localStorage.getItem(`${name}-fo3d-camera-position`)
        );
      },
      { name: datasetName, validatorBody: SAVED_CAMERA_STATE_VALIDATOR_BODY }
    ) as Promise<SavedCameraState | null>;
  }

  async waitForSavedCameraState(
    datasetName: string,
    timeout = 10000
  ): Promise<SavedCameraState> {
    await this.page.waitForFunction(
      ({ name, validatorBody }) => {
        const validateSavedCameraState = new Function("raw", validatorBody);

        return Boolean(
          validateSavedCameraState(
            localStorage.getItem(`${name}-fo3d-camera-position`)
          )
        );
      },
      { name: datasetName, validatorBody: SAVED_CAMERA_STATE_VALIDATOR_BODY },
      { timeout }
    );

    const savedState = await this.getSavedCameraState(datasetName);
    if (!savedState) {
      throw new Error(
        `Saved camera state for dataset "${datasetName}" was not found`
      );
    }

    return savedState;
  }

  async clearSavedCameraState(datasetName: string): Promise<void> {
    await this.page.evaluate((name) => {
      localStorage.removeItem(`${name}-fo3d-camera-position`);
    }, datasetName);
  }

  async dragCameraBy(deltaX: number, deltaY: number): Promise<void> {
    await this.looker3d.waitFor({ state: "visible" });

    const box = await this.looker3d.boundingBox();
    if (!box) {
      throw new Error("Unable to find looker3d bounds for camera drag");
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Ease into the drag and then interpolate a longer path so the renderer
    // consistently receives pointer movement events during camera rotation.
    await this.page.mouse.move(startX, startY, { steps: 6 });
    await this.page.mouse.down();
    await this.page.mouse.move(startX + deltaX, startY + deltaY, {
      steps: 18,
    });
    await this.page.mouse.up();
  }

  private parseCameraPosition(text: string): CameraPosition {
    const match = text.match(
      /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/
    );

    if (!match) {
      throw new Error(`Unable to parse camera position from "${text}"`);
    }

    return [
      Number.parseFloat(match[1]),
      Number.parseFloat(match[2]),
      Number.parseFloat(match[3]),
    ];
  }
}
