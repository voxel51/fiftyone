import { JSONIcon } from "@fiftyone/components";
import { Sample } from "@fiftyone/looker/src/state";
import { useJSONPanel } from "@fiftyone/state";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import { ACTION_VIEW_JSON, currentActionAtom } from "../state";

export const ViewJSON = (props: {
  sample: Sample;
  jsonPanel: ReturnType<typeof useJSONPanel>;
}) => {
  const { sample, jsonPanel } = props;
  const [currentAction, setAction] = recoil.useRecoilState(currentActionAtom);

  return (
    <>
      <ActionItem>
        <JSONIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={(e) => {
            const targetAction = ACTION_VIEW_JSON;
            const nextAction =
              currentAction === targetAction ? null : targetAction;
            setAction(nextAction);
            jsonPanel.toggle(sample);
            e.stopPropagation();
            e.preventDefault();
            return false;
          }}
          data-for-panel={ACTION_VIEW_JSON}
        />
      </ActionItem>
    </>
  );
};
