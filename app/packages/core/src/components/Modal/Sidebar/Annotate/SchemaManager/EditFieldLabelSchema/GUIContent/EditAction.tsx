/**
 * Edit action button component.
 */

import { Clickable, Icon, IconName, Size } from "@voxel51/voodo";

interface EditActionProps {
  onEdit: () => void;
}

const EditAction = ({ onEdit }: EditActionProps) => (
  <Clickable onClick={onEdit}>
    <Icon name={IconName.Edit} size={Size.Md} />
  </Clickable>
);

export default EditAction;
