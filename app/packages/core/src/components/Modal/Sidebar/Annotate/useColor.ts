import { useTheme } from "@fiftyone/components";
import { pathColor } from "@fiftyone/state";
import { useRecoilValue } from "recoil";

export default function useColor(path?: string) {
  const color = useRecoilValue(pathColor(path ?? ""));
  const brand = useTheme().primary.plainColor;

  return path ? color : brand;
}
