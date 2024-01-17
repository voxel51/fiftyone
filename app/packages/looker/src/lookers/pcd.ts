import { get3dElements } from "../elements";
import { COMMON_SHORTCUTS } from "../elements/common";
import { DEFAULT_3D_OPTIONS, ThreeDState } from "../state";
import { AbstractLooker } from "./abstract";
import { LookerUtils } from "./shared";

export class ThreeDLooker extends AbstractLooker<ThreeDState> {
  getElements(config) {
    return get3dElements(config, this.updater, this.getDispatchEvent());
  }

  hasDefaultZoom(): boolean {
    return false;
  }

  getInitialState(
    config: ThreeDState["config"],
    options: ThreeDState["options"]
  ) {
    options = {
      ...this.getDefaultOptions(),
      ...options,
    };

    return {
      ...this.getInitialBaseState(),
      config: { ...config },
      options,
      SHORTCUTS: COMMON_SHORTCUTS,
    };
  }

  getDefaultOptions() {
    return DEFAULT_3D_OPTIONS;
  }

  updateOptions(options: Partial<ThreeDState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);
    const state: Partial<ThreeDState> = { options };
    if (reload) {
      this.updater({
        ...state,
        reloading: this.state.disabled,
        disabled: false,
      });
      this.updateSample(this.sample);
    } else {
      this.updater({ ...state, disabled: false });
    }
  }
}
