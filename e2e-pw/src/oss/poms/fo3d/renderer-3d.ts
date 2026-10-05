import { Locator, Page } from "src/oss/fixtures";
import { Asset3dPanelPom } from "src/oss/poms/fo3d/assets-panel";
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
  readonly asset3dPanel: Asset3dPanelPom;
  readonly modalLookerContainer: Locator;
  readonly looker3d: Locator;
  readonly statusBar: Locator;
  readonly statusBarToggle: Locator;
  readonly statusBarClose: Locator;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.asset3dPanel = new Asset3dPanelPom(this.page);
    this.modalLookerContainer = this.page.getByTestId("modal-looker-container");
    this.looker3d = this.modalLookerContainer.getByTestId("looker3d");
    this.statusBar =
      this.modalLookerContainer.getByTestId("looker3d-statusbar");
    this.statusBarToggle = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-toggle",
    );
    this.statusBarClose = this.modalLookerContainer.getByTestId(
      "looker3d-statusbar-close",
    );
  }

  /** The camera position the canvas last rendered (the status bar lags it). */
  async getCameraPosition(): Promise<CameraPosition> {
    const position = (await this.eventUtils.latest([CAMERA_POSITION]))[
      CAMERA_POSITION
    ];
    if (!position) {
      throw new Error("no 3D camera has rendered on the page");
    }
    return [position.x, position.y, position.z] as CameraPosition;
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
