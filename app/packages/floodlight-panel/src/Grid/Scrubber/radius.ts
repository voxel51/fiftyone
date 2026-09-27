import { Radius } from "@voxel51/voodo";

export const RADIUS_STYLES: Record<Radius, string> = {
  [Radius.None]: "rounded-none",
  [Radius.Xs]: "rounded-xs",
  [Radius.Sm]: "rounded-sm",
  [Radius.Md]: "rounded-md",
  [Radius.Lg]: "rounded-lg",
  [Radius.Xl]: "rounded-xl",
  [Radius.Full]: "rounded-full",
};

export default function radiusStyles(radius: Radius): string {
  return RADIUS_STYLES[radius];
}
