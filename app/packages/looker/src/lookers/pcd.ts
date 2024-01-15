import { getPcdElements } from "../elements";
import { COMMON_SHORTCUTS } from "../elements/common";
import { DEFAULT_PCD_OPTIONS, Optional, PcdState } from "../state";
import { AbstractLooker } from "./abstract";
import { LookerUtils } from "./shared";

export class ThreeDLooker extends AbstractLooker<PcdState> {
  getElements(config) {
    return getPcdElements(config, this.updater, this.getDispatchEvent());
  }

  hasDefaultZoom(): boolean {
    return false;
  }

  getInitialState(config: PcdState["config"], options: PcdState["options"]) {
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
    return DEFAULT_PCD_OPTIONS;
  }

  updateOptions(options: Partial<PcdState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);
    const state: Partial<PcdState> = { options };
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
