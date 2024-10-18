import { useTheme } from "@fiftyone/components";
import type { useJSONPanel } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { AccountTree } from "@mui/icons-material";
import { useCallback, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import { ACTION_VIEW_JSON } from "../constants";
import { ActionItem } from "../containers";
import { useHotkey } from "../hooks";

export const ViewFo3d = (props: {
  jsonPanel: ReturnType<typeof useJSONPanel>;
}) => {
  const { jsonPanel } = props;

  const fo3d = useRecoilValue(fos.fo3dContent);

  const [isJsonPanelOpen, setIsJsonPanelOpen] = useState(false);

  const { primary } = useTheme();

  const buttonRef = useRef(null);

  const toggleJson = useCallback(
    (e?) => {
      setIsJsonPanelOpen((prev) => !prev);
      jsonPanel.toggle(fo3d);
      e?.stopPropagation();
      e?.preventDefault();
      return false;
    },
    [jsonPanel, fo3d]
  );

  useHotkey(
    "KeyI",
    () => {
      setIsJsonPanelOpen((prev) => !prev);
      jsonPanel.toggle(fo3d);
      return () => {};
    },
    [jsonPanel],
    { useTransaction: false }
  );

  fos.useOutsideClick(buttonRef, () => {
    setIsJsonPanelOpen(false);
  });

  return (
    <ActionItem title="Inspect FO3D (I)">
      <AccountTree
        ref={buttonRef}
        onClick={toggleJson}
        data-for-panel={ACTION_VIEW_JSON}
        style={{ color: isJsonPanelOpen ? primary.main : "inherit" }}
      />
    </ActionItem>
  );
};
