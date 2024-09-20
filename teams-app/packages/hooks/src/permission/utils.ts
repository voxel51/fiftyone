import { UserRole } from '@fiftyone/teams-state/src/Settings/__generated__/teamInvitationsQuery.graphql';
import { FragmentRefs } from 'relay-runtime';

export type RoleAttribute = {
  readonly role: UserRole;
  readonly attributes: readonly {
    readonly ' $fragmentSpreads': FragmentRefs<'teamAttrFrag'>;
  }[];
};

export function convertRoleAttributes(
  roles: RoleAttribute[],
  roleOrder: string[]
): any[][] {
  // Sort roles once based on roleOrder
  const sortedRoles = [...roles].sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  );

  const maxLength = Math.max(
    ...sortedRoles.map((role) => role.attributes.length)
  );
  const output: any[][] = [];

  for (let i = 0; i < maxLength; i++) {
    const layer = sortedRoles.map((role) => role.attributes[i]); // Directly map to the attribute value

    output.push(layer);
  }

  return output;
}
