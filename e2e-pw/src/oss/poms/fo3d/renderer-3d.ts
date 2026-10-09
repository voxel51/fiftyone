import { Locator, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

export type CameraPosition = [number, number, number];
const CAMERA_POSITION = "e2e:looker3d:camera-position";

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
  tolerance = 0.5,
): boolean {
  return (
    Math.abs(a[0] - b[0]) < tolerance &&
    Math.abs(a[1] - b[1]) < tolerance &&
    Math.abs(a[2] - b[2]) < tolerance
  );
}

export class Renderer3dPom {
  readonly modalLookerContainer: Locator;
  readonly statusBar: Locator;
  readonly statusBarToggle: Locator;
  readonly statusBarClose: Locator;
  readonly statusBarCameraPosition: Locator;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.modalLookerContainer = this.page.getByTestId("modal-looker-container");
    this.statusBar =
      this.modalLookerContainer.getByTestId("looker3d-statusbar");
    this.statusBarToggle = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-toggle",
    );
    this.statusBarClose = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-close",
    );
    this.statusBarCameraPosition = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-camera-position",
    );
  }

  /**
   * The camera position the status bar shows. An open status bar trails a
   * moving camera by a frame, so each read opens it afresh, reads the
   * position it shows as it opens, and closes it again.
   */
  async getCameraPosition(): Promise<CameraPosition> {
    if (await this.statusBar.isVisible()) {
      await this.statusBarClose.click();
    }
    await this.eventUtils.after(CAMERA_POSITION, () =>
      this.statusBarToggle.click(),
    );
    const text = await this.statusBarCameraPosition.textContent();
    await this.statusBarClose.click();
    return parseCameraPosition(text ?? "");
  }

  /**
   * Run `action` and resolve once the camera pose it moves to is saved; the
   * scene saves a pose only when it changes
   */
  async afterCameraSaved<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:looker3d:camera-saved", action);
  }

  async getSavedCameraState(
    datasetName: string,
  ): Promise<SavedCameraState | null> {
    return this.page.evaluate(
      ({ name, validatorBody }) => {
        const validateSavedCameraState = new Function("raw", validatorBody);

        return validateSavedCameraState(
          localStorage.getItem(`${name}-fo3d-camera-position`),
        );
      },
      { name: datasetName, validatorBody: SAVED_CAMERA_STATE_VALIDATOR_BODY },
    ) as Promise<SavedCameraState | null>;
  }

  async clearSavedCameraState(datasetName: string): Promise<void> {
    await this.page.evaluate((name) => {
      localStorage.removeItem(`${name}-fo3d-camera-position`);
    }, datasetName);
  }
}

function parseCameraPosition(text: string): CameraPosition {
  const match = /^(-?\d+\.\d{2}), (-?\d+\.\d{2}), (-?\d+\.\d{2})$/.exec(text);
  if (!match) {
    throw new Error(`the status bar shows no camera position: "${text}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
