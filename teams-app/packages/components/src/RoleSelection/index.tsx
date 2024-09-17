import { Selection } from '@fiftyone/teams-components';
import { USER_ROLES } from '@fiftyone/teams-state/src/constants';
import { SelectProps } from '@mui/material';
import { SelectionProps } from '../Selection';

export type RoleSelectionProps = Omit<SelectionProps, 'items'> & {
  items?: SelectionProps['items'];
  defaultValue: string;
  value?: string;
  onChange?: (role: string) => void;
  selectProps?: SelectProps;
  disabled?: boolean;
  loading?: boolean;
};

export default function RoleSelection(props: RoleSelectionProps) {
  return <Selection items={USER_ROLES} {...props} />;
}
