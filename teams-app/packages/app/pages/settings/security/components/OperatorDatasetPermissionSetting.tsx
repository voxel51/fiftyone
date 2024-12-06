import { OPERATOR_DATASET_PERMISSIONS } from "@fiftyone/teams-state/src/constants";
import { SettingComponentProps } from "../config/types";
import DatasetPermissionSetting from "./DatasetPermissionSetting";

export default function OperatorDatasetPermissionSetting(
  props: SettingComponentProps
) {
  return (
    <DatasetPermissionSetting {...props} items={OPERATOR_DATASET_PERMISSIONS} />
  );
}
