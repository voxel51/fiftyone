import { ModalPom } from "src/oss/poms/modal";

/**
 * Hide these elements when taking screenshots
 */
export const getScreenshotMasks = (modal: ModalPom) => [
  modal.locator.getByTestId("looker3d-action-bar"),
  modal.locator.getByTestId("selectable-bar"),
];
