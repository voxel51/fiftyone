import {
  useCurrentDatasetPermission,
  useCurrentUserPermission,
} from "@fiftyone/hooks";
import Custom404 from "@fiftyone/teams-app/pages/404";
import { PermissionResolver } from "@fiftyone/teams-state";

type Scope = "user" | "dataset";

export default function withPermissions<ComponentProps>(
  Component: React.ComponentType<ComponentProps>,
  permissions: Array<PermissionResolver>,
  scope: Scope,
  ComponentObjectProperties: {} = {}
): React.ComponentType<ComponentProps> {
  const ComponentWithPermission = (props: ComponentProps & {}) => {
    const permissionHook =
      scope === "user" ? useCurrentUserPermission : useCurrentDatasetPermission;
    const allowed = permissionHook(permissions);
    return allowed ? <Component {...props} /> : <Custom404 />;
  };

  for (const prop in ComponentObjectProperties) {
    ComponentWithPermission[prop] = ComponentObjectProperties[prop];
  }

  return ComponentWithPermission;
}
