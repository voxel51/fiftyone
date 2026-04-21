import { ColorSchemeInput } from "@fiftyone/relay";
import { SetterOrUpdater } from "recoil";
import { ExecutionContext as EC } from "../operators";

export type ExecutionContext<
  PARAMS = Record<string, unknown>,
  HOOKS = Record<string, unknown>
> = EC & {
  params: PARAMS;
  hooks: HOOKS;
};

export type SetColorSchemeParams = {
  color_by?: string;
  color_pool?: string[];
  color_scheme?: Record<string, unknown>;
  color_pool_preset?: "default" | "color-blind-friendly";
  default_mask_targets_colors?: Array<{ initTarget: number; color: string }>;
  default_colorscale?: Array<{ value: number; color: string }>;
  default_colorscale_preset?: string;
  multi_color_keypoints?: boolean;
  opacity?: number;
  show_keypoint_skeletons?: boolean;
};

export type SetColorSchemeHooks = {
  setColorScheme: SetterOrUpdater<ColorSchemeInput>;
  defaultPool: readonly string[];
};

export type ResetColorSchemeHooks = {
  resetColorScheme: () => void;
};
