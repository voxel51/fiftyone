import { useTheme } from "@fiftyone/components";
import { DisplaySettings } from "@mui/icons-material";
import React from "react";
import { useRecoilState } from "recoil";
import { ACTION_VIEW_JSON } from "../constants";
import { ActionItem } from "../containers";
import { isLevaConfigPanelOnAtom } from "../state";

export const LevaConfigPanel = React.memo(() => {
  const [isLevaPanelOn, setIsLevaPanelOn] = useRecoilState(
    isLevaConfigPanelOnAtom
  );
  const { primary } = useTheme();

  return (
    <>
      <ActionItem title="Render Preferences">
        <DisplaySettings
          onClick={() => setIsLevaPanelOn((prev) => !prev)}
          data-for-panel={ACTION_VIEW_JSON}
          style={{ color: isLevaPanelOn ? primary.main : "inherit" }}
        />
      </ActionItem>
    </>
  );
});
