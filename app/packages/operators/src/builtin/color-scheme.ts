import * as fos from "@fiftyone/state";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { Operator, OperatorConfig } from "../operators";
import * as types from "../types";

import type {
  ExecutionContext,
  ResetColorSchemeHooks,
  SetColorSchemeHooks,
  SetColorSchemeParams,
} from "../ts";

export class SetColorScheme extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "set_color_scheme",
      label: "Set color scheme",
      unlisted: true,
    });
  }
  async resolveInput(): Promise<types.Property> {
    const inputs = new types.Object();
    inputs.str("color_by");
    inputs.enum("color_pool_preset", ["default", "color-blind-friendly"]);
    inputs.list("color_pool", new types.String());
    const maskTargetsColors = new types.Object();
    maskTargetsColors.int("intTarget"); // value must be greater than 0
    maskTargetsColors.str("border");
    inputs.list("default_mask_targets_colors", maskTargetsColors);
    const colorscale = new types.Object();
    colorscale.float("value", { required: true });
    colorscale.str("color", { required: true });
    inputs.list("default_colorscale", colorscale);
    inputs.str("default_colorscale_preset");
    inputs.bool("multi_color_keypoints");
    inputs.float("opacity");
    inputs.bool("show_keypoint_skeletons");
    return new types.Property(inputs);
  }
  useHooks(): SetColorSchemeHooks {
    const setColorScheme = useSetRecoilState(fos.colorScheme);
    const defaultPool = useRecoilValue(fos.config).colorPool;

    return { setColorScheme, defaultPool };
  }
  async execute(
    ctx: ExecutionContext<SetColorSchemeParams, SetColorSchemeHooks>
  ): Promise<void> {
    const { hooks, params } = ctx;
    const { setColorScheme, defaultPool } = hooks;
    const {
      color_by,
      color_pool,
      color_pool_preset,
      default_colorscale,
      default_colorscale_preset,
      default_mask_targets_colors,
      multi_color_keypoints,
      opacity,
      show_keypoint_skeletons,
      ...otherParams
    } = params;

    const updatedColorScheme = otherParams ?? {};

    if (color_by) {
      updatedColorScheme["colorBy"] = color_by;
    }

    if (color_pool_preset === "default") {
      updatedColorScheme["colorPool"] = defaultPool;
    } else if (color_pool_preset === "color-blind-friendly") {
      updatedColorScheme["colorPool"] =
        fos.constants.COLOR_BLIND_FRIENDLY_PALETTE;
    }

    if (color_pool) {
      updatedColorScheme["colorPool"] = color_pool;
    }

    // name takes precedence over list for colorscale
    // value must be between 0 and 1
    if (default_colorscale_preset) {
      updatedColorScheme["defaultColorscale"] = {
        name: default_colorscale_preset,
        list: null,
      };
    } else if (default_colorscale) {
      updatedColorScheme["defaultColorscale"] = {
        name: null,
        list: default_colorscale,
      };
    }

    if (default_mask_targets_colors) {
      updatedColorScheme["defaultMaskTargetsColors"] =
        default_mask_targets_colors;
    }

    if (opacity !== undefined) {
      updatedColorScheme["opacity"] = opacity;
    }

    if (multi_color_keypoints) {
      updatedColorScheme["multicolorKeypoints"] = multi_color_keypoints;
    }

    if (show_keypoint_skeletons) {
      updatedColorScheme["showSkeletons"] = show_keypoint_skeletons;
    }

    setColorScheme((colorScheme) => ({
      ...colorScheme,
      ...updatedColorScheme,
    }));
  }
}

export class ResetColorScheme extends Operator {
  _builtIn = true;
  get config(): OperatorConfig {
    return new OperatorConfig({
      name: "reset_color_scheme",
      label: "Reset color scheme",
    });
  }

  useHooks(): ResetColorSchemeHooks {
    const setColorScheme = useSetRecoilState(fos.colorScheme);
    const colorScheme = useRecoilValue(fos.colorScheme);
    const configDefault = useRecoilValue(fos.config);
    const datasetDefault = useRecoilValue(fos.datasetColorScheme);

    const { id: _, ...update } = fos.ensureColorScheme(
      datasetDefault,
      configDefault
    );
    return {
      resetColorScheme: () => {
        setColorScheme({ id: colorScheme.id, ...update });
      },
    };
  }

  async execute(
    ctx: ExecutionContext<void, ResetColorSchemeHooks>
  ): Promise<void> {
    const { hooks } = ctx;
    const { resetColorScheme } = hooks;

    resetColorScheme();
  }
}
