import { DatasetPermissionSelection } from "@fiftyone/teams-components";
import { DatasetPermissionSelectionProps } from "@fiftyone/teams-components/src/DatasetPermissionSelection";
import { SettingComponentProps } from "../config/types";

export default function DatasetPermissionSetting(
  props: DatasetPermissionSettingProps
) {
  const { value, onChange, updating, ...otherProps } = props;
  return (
    <DatasetPermissionSelection
      {...otherProps}
      key={value as string}
      defaultValue={value as any}
      onChange={onChange}
      selectProps={{ sx: { width: "100%" } }}
      includeNoAccess
      disabled={updating}
      loading={updating}
    />
  );
}

type DatasetPermissionSettingProps = DatasetPermissionSelectionProps &
  SettingComponentProps;
