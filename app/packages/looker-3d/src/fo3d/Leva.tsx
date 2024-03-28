import { useFont, useTheme } from "@fiftyone/components";
import { Leva as LevaOptions } from "leva";
import { createPortal } from "react-dom";
import { LevaContainer } from "../containers";

function Leva() {
  const theme = useTheme();
  const font = useFont();

  return (
    <>
      {createPortal(
        <LevaContainer>
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
            hideCopyButton
            flat
          />
        </LevaContainer>,
        document.getElementById("modal")
      )}
    </>
  );
}

export default Leva;
