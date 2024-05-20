import { JSONIcon } from "@fiftyone/components";
import { Sample } from "@fiftyone/looker/src/state";
import { ModalSample, useJSONPanel } from "@fiftyone/state";
import { ACTION_VIEW_JSON } from "../constants";
import { ActionItem } from "../containers";

export const ViewJSON = (props: {
  sample: Sample | ModalSample | Record<string, ModalSample>;
  jsonPanel: ReturnType<typeof useJSONPanel>;
}) => {
  const { sample, jsonPanel } = props;

  return (
    <>
      <ActionItem>
        <JSONIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={(e) => {
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
