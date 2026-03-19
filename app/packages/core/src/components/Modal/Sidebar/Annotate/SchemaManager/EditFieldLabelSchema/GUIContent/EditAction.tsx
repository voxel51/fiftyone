/**
 * Edit action button component.
 */

import { Button, Icon, IconName, Size, Variant } from "@voxel51/voodo";

interface EditActionProps {
  onEdit: () => void;
}

const EditAction = ({ onEdit }: EditActionProps) => (
  <Button variant={Variant.Icon} borderless onClick={onEdit}>
    <Icon name={IconName.Edit} size={Size.Md} />
  </Button>
);

export default EditAction;
