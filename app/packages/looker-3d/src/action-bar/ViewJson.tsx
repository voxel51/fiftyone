import { JSONIcon } from "@fiftyone/components";
import { Sample } from "@fiftyone/looker/src/state";
import { useJSONPanel } from "@fiftyone/state";
import { ActionItem } from "../containers";
import { ACTION_VIEW_JSON } from "../constants";

export const ViewJSON = (props: {
  sample: Sample;
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
