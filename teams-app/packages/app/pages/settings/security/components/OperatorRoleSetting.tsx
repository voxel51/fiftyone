import { OPERATOR_USER_ROLES } from '@fiftyone/teams-state/src/constants';
import { SettingComponentProps } from '../config/types';
import RoleSetting from './RoleSetting';
import { useUserRole } from '@fiftyone/hooks';


export default function OperatorRoleSetting(props: SettingComponentProps) {
  const { operatorMinRoleOptions } = useUserRole();
  return <RoleSetting {...props} items={operatorMinRoleOptions} />;
}
