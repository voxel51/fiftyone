import { Button } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useJSONPanel } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { ACTION_VIEW_JSON } from "../constants";
import { ActionItem } from "../containers";

export const ViewFo3d = (props: {
  jsonPanel: ReturnType<typeof useJSONPanel>;
}) => {
  const { jsonPanel } = props;

  const fo3d = useRecoilValue(fos.fo3dContent);

  const toggleJson = useCallback(
    (e) => {
      jsonPanel.toggle(fo3d);
      e.stopPropagation();
      e.preventDefault();
      return false;
    },
    [jsonPanel, fo3d]
  );

  return (
    <>
      <ActionItem>
        <Button onClick={toggleJson} data-for-panel={ACTION_VIEW_JSON}>
          Inspect
        </Button>
      </ActionItem>
    </>
  );
};
