import { ToolbarAction } from "@fiftyone/actions";
import { groupSlice, groupSlices, useSetGroupSlice } from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import { Dropdown, DropdownAnchor, MenuCheckItem } from "@voxel51/voodo";

/** The group slice the grid shows */
const GroupSlice = () => {
  const slice = useReverbValue(groupSlice);
  if (!slice) {
    throw new Error("slice not defined");
  }
  const setSlice = useSetGroupSlice();
  const slices = useReverbValue(groupSlices);

  return (
    <Dropdown
      portal
      anchor={DropdownAnchor.BottomEnd}
      trigger={
        <ToolbarAction
          aria-label={`Group slice: ${slice}`}
          data-cy="group-slice"
          label={slice}
          menu
        />
      }
    >
      {slices.map((name) => (
        <MenuCheckItem
          key={name}
          checked={name === slice}
          onClick={() => setSlice(name)}
        >
          {name}
        </MenuCheckItem>
      ))}
    </Dropdown>
  );
};

export default GroupSlice;
