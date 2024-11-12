import { useRouter } from "next/router";
import { RouteNav } from "@fiftyone/teams-components";
import { useCurrentDatasetPermission } from "@fiftyone/hooks";
import { DELETE_DATASET, MANAGE_DATASET_ACCESS } from "@fiftyone/teams-state";

export default function ManageNav() {
  const {
    query: { slug },
  } = useRouter();
  const canDelete = useCurrentDatasetPermission([DELETE_DATASET]);
  const canManageDatasetAccess = useCurrentDatasetPermission([
    MANAGE_DATASET_ACCESS,
  ]);

  return (
    <RouteNav
      routes={[
        {
          key: "basic_info",
          label: "Basic info",
          id: "basic_info",
          href: `/datasets/${slug}/manage/basic_info`,
        },
        ...(canManageDatasetAccess
          ? [
              {
                key: "access",
                label: "Access",
                id: "access",
                href: `/datasets/${slug}/manage/access`,
              },
            ]
          : []),
        ...(canDelete
          ? [
              {
                key: "danger_zone",
                label: "Danger zone",
                id: "danger_zone",
                href: `/datasets/${slug}/manage/danger_zone`,
              },
            ]
          : []),
      ]}
    />
  );
}
