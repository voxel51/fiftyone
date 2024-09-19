import { RoleSelection } from '@fiftyone/teams-components';
import { RoleSelectionProps } from '@fiftyone/teams-components/src/RoleSelection';
import { SettingComponentProps } from '../config/types';

export default function RoleSetting(props: RoleSettingProps) {
  const { value, onChange, updating, ...otherProps } = props;
  return (
    <RoleSelection
      {...otherProps}
      key={value as string}
      defaultValue={value as string}
      onChange={onChange}
      selectProps={{ fullWidth: true }}
      disabled={updating}
      loading={updating}
    />
  );
}

type RoleSettingProps = RoleSelectionProps & SettingComponentProps;
