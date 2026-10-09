import * as fos from "@fiftyone/state";
import { useReverbState, useReverbValue } from "@fiftyone/reverb";
import {
  BackgroundColor,
  Pill,
  Size,
  SlidersHorizontalIcon,
  TextColor,
} from "@voxel51/voodo";
import ToolbarAction from "./ToolbarAction";

/** Shows or hides the sidebar, with the number of fields filtering the grid */
const FiltersToggle = () => {
  const [visible, setVisible] = useReverbState(fos.sidebarVisible(false));
  const count = Object.keys(useReverbValue(fos.filters) ?? {}).length;
  const label = visible ? "Hide filters" : "Show filters";

  return (
    <ToolbarAction
      aria-label={label}
      title={label}
      data-cy="action-toggle-sidebar"
      icon={SlidersHorizontalIcon}
      label={
        count > 0 ? (
          <Pill
            size={Size.Xs}
            backgroundColor={BackgroundColor.CardElevated}
            color={TextColor.Secondary}
          >
            {count}
          </Pill>
        ) : undefined
      }
      style={{ color: "var(--color-content-icon-default)" }}
      onClick={() => setVisible(!visible)}
    />
  );
};

export default FiltersToggle;
