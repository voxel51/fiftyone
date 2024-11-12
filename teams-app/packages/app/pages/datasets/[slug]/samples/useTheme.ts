import { theme } from "@fiftyone/state";
import { useColorScheme } from "@mui/material";
import { useLayoutEffect } from "react";
import { useSetRecoilState } from "recoil";

export default function useTheme() {
  const { mode } = useColorScheme();
  const setTheme = useSetRecoilState(theme);

  useLayoutEffect(() => {
    setTheme(mode);
  }, [mode]);
}
