import { AbstractLooker } from "./abstract";
import {
  BaseConfig,
  BaseOptions,
  BaseState,
  DEFAULT_BASE_OPTIONS,
} from "../state";
import { COMMON_SHORTCUTS, LookerElement } from "../elements/common";
import { Overlay } from "../overlays/base";
import { getFileElements } from "../elements";

/**
 * Looker which renders metadata and/or file contents for non-visual samples.
 */
export class FileLooker extends AbstractLooker<BaseState> {
  updateOptions(options: Partial<BaseOptions>): void {}

  protected hasDefaultZoom(
    state: BaseState,
    overlays: Overlay<BaseState>[]
  ): boolean {
    return false;
  }

  protected getElements(
    config: Readonly<BaseConfig>
  ): LookerElement<BaseState> {
    return getFileElements({
      abortController: this.abortController,
      config,
      update: this.updater,
      dispatchEvent: this.getDispatchEvent(),
    });
  }

  protected getDefaultOptions(): BaseOptions {
    return DEFAULT_BASE_OPTIONS;
  }

  protected getInitialState(
    config: BaseConfig,
    options: Partial<BaseOptions>
  ): BaseState {
    return {
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
      SHORTCUTS: COMMON_SHORTCUTS,
    };
  }
}
