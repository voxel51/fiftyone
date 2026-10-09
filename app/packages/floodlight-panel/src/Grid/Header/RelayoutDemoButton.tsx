import * as fos from "@fiftyone/state";
import { Anchor, Icon, IconName, Size, Tooltip } from "@voxel51/voodo";
import { useRelayoutDemo } from "../relayoutDemo";
import { PRESS_CLASS, TOOLTIP_CLASS } from "./classes";

/** Demo: removes the selected samples from view to show the relayout. */
const RelayoutDemoButton = () => {
  const demo = useRelayoutDemo();
  const [selected, setSelected] = fos.useLegacySelectedSamples();
  if (!demo) return null;
  const count = selected.size;

  return (
    <Tooltip
      content={
        count
          ? `Remove ${count} selected from view (relayout demo)`
          : "Select samples to remove them from view (relayout demo)"
      }
      anchor={Anchor.Left}
      className={TOOLTIP_CLASS}
      portal
    >
      <div
        className={PRESS_CLASS}
        data-cy="floodlight-relayout-demo"
        style={{ opacity: count ? 1 : 0.45 }}
        onClick={() => {
          if (!count) return;
          demo.run(new Set(selected.keys()));
          setSelected(new Map());
        }}
        onKeyDown={() => null}
      >
        <Icon name={IconName.Remove} size={Size.Xl} />
      </div>
    </Tooltip>
  );
};

export default RelayoutDemoButton;
