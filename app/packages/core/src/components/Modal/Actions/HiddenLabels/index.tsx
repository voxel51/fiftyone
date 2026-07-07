import {
  PillButton,
  MuiVisibilityOffIcon as VisibilityOff,
} from "@fiftyone/components";
import { hiddenLabels } from "@fiftyone/state";
import { useRecoilState } from "recoil";

const HiddenLabels = ({ modal }: { modal?: boolean }) => {
  const [hiddenObjects, setHiddenObjects] = useRecoilState(hiddenLabels);
  const count = Object.keys(hiddenObjects).length;

  if (count < 1) {
    return null;
  }

  return (
    <PillButton
      icon={<VisibilityOff />}
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
