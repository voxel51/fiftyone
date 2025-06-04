import { useFont, useTheme } from "@fiftyone/components";
import { Leva as LevaOptions } from "leva";
import { createPortal } from "react-dom";
import { useRecoilState } from "recoil";
import { useHotkey } from "../hooks";
import { isLevaConfigPanelOnAtom } from "../state";

export const LEVA_CONTAINER_ID = "fo-leva-container";

export const Leva = () => {
  const theme = useTheme();
  const font = useFont();

  const [isLevaPanelOn, setIsLevaPanelOn] = useRecoilState(
    isLevaConfigPanelOnAtom
  );

  useHotkey(
    "KeyR",
    () => {
      setIsLevaPanelOn((prev) => !prev);
    },
    [],
    { useTransaction: false }
  );

  return createPortal(
    <LevaOptions
      theme={{
        colors: {
          accent1: theme.primary.main,
          accent2: theme.primary.main,
          accent3: theme.background.default,

          elevation1: theme.background.level3,
          elevation2: theme.background.level1,
          elevation3: theme.background.level2,

          highlight1: theme.text.secondary,
          highlight2: theme.text.secondary,
          highlight3: theme.text.primary,

          folderWidgetColor: theme.primary.main,
        },

        fonts: {
          mono: font,
          sans: font,
        },
      }}
      fill
      titleBar={{
        drag: false,
        title: "Render Preferences (R)",
      }}
      hideCopyButton
      collapsed={{
        collapsed: !isLevaPanelOn,
        onChange: (collapsed) => setIsLevaPanelOn(!collapsed),
      }}
      flat
      hidden={!isLevaPanelOn}
    />,
    document.getElementById(LEVA_CONTAINER_ID) ?? document.body
  );
};
