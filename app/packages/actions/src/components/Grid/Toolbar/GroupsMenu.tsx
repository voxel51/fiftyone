import {
  useOperatorExecutor,
  usePromptOperatorInput,
} from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { GROUP_BY_VIEW_STAGE } from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import {
  AddIcon,
  Dropdown,
  DropdownAnchor,
  LayersIcon,
  MenuCheckItem,
  MenuIconTextItem,
  MenuSectionTitle,
  MenuSeparator,
} from "@voxel51/voodo";
import ToolbarAction from "./ToolbarAction";

const GROUP_BY = "@voxel51/operators/load_group_by";

// the field types the group_by operator offers
const GROUP_FIELDS = [
  INT_FIELD,
  OBJECT_ID_FIELD,
  BOOLEAN_FIELD,
  DATE_FIELD,
  STRING_FIELD,
];

/** Groups the grid by a field, through the group_by operator */
const GroupsMenu = () => {
  const fields = useReverbValue(fos.fieldPaths({ ftype: GROUP_FIELDS }));
  const params = useReverbValue(fos.dynamicGroupParameters);
  const view = useReverbValue(fos.view);
  const setView = fos.useSetView();
  const groupBy = useOperatorExecutor(GROUP_BY);
  const prompt = usePromptOperatorInput();
  // a compound group key arrives as its fields
  const current = Array.isArray(params?.groupBy)
    ? params.groupBy.join(", ")
    : params?.groupBy;

  return (
    <Dropdown
      portal
      anchor={DropdownAnchor.BottomStart}
      trigger={
        <ToolbarAction
          active={Boolean(current)}
          data-cy="action-groups"
          icon={LayersIcon}
          label={current ? `By ${current}` : "Groups"}
          menu
        />
      }
    >
      <MenuSectionTitle>Group by</MenuSectionTitle>
      <MenuCheckItem
        checked={!current}
        onClick={() =>
          current &&
          setView(view.filter((stage) => stage._cls !== GROUP_BY_VIEW_STAGE))
        }
      >
        None
      </MenuCheckItem>
      {fields.map((field) => (
        <MenuCheckItem
          key={field}
          checked={current === field}
          onClick={() => groupBy.execute({ group_by: field })}
        >
          {field}
        </MenuCheckItem>
      ))}
      <MenuSeparator />
      <MenuIconTextItem
        icon={<AddIcon size={14} />}
        text="Create dynamic group"
        onClick={() => prompt(GROUP_BY)}
      />
    </Dropdown>
  );
};

export default GroupsMenu;
