import { PillButton } from "@fiftyone/components";
import { hiddenLabels } from "@fiftyone/state";
import { useReverbState } from "@fiftyone/reverb";
import { VisibilityOffIcon } from "@voxel51/voodo";

const HiddenLabels = ({ modal }: { modal?: boolean }) => {
  const [hiddenObjects, setHiddenObjects] = useReverbState(hiddenLabels);
  const count = Object.keys(hiddenObjects).length;

  if (count < 1) {
    return null;
  }

  return (
    <PillButton
      icon={<VisibilityOffIcon size={18} />}
      tooltipPlacement={modal ? "bottom" : "top"}
      open={true}
      onClick={() => setHiddenObjects({})}
      highlight={true}
      style={modal ? { padding: "0 0.5em" } : {}}
      text={`${count}`}
      title={"Clear hidden labels"}
      data-cy="action-clear-hidden-labels"
    />
  );
};

export default HiddenLabels;
