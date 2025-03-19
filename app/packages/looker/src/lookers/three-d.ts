import { get3dElements } from "../elements";
import { COMMON_SHORTCUTS } from "../elements/common";
import type { ThreeDState } from "../state";
import { DEFAULT_3D_OPTIONS } from "../state";
import { AbstractLooker } from "./abstract";

export class ThreeDLooker extends AbstractLooker<ThreeDState> {
  getElements(config) {
    return get3dElements({
      abortController: this.abortController,
      config,
      update: this.updater,
      dispatchEvent: this.getDispatchEvent(),
    });
  }

  hasDefaultZoom(): boolean {
    return false;
  }

  getInitialState(
    config: ThreeDState["config"],
    options: ThreeDState["options"]
  ) {
    const initialOptions = {
      ...this.getDefaultOptions(),
      ...options,
    };

    return {
      ...this.getInitialBaseState(),
      config: { ...config },
      options: initialOptions,
      SHORTCUTS: COMMON_SHORTCUTS,
    };
  }

  getDefaultOptions() {
    return DEFAULT_3D_OPTIONS;
  }
}
