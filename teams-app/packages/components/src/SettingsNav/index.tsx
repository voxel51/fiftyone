import {
  useCurrentOrganization,
  useCurrentUserHasMinimumRole,
  useCurrentUserPermission
} from '@fiftyone/hooks';
import {
  CONSTANT_VARIABLES,
  MANAGE_ORGANIZATION,
  Role
} from '@fiftyone/teams-state';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListSubheader
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/router';

const { SETTINGS_NAV_ITEMS } = CONSTANT_VARIABLES;

export default function SettingsNav() {
  const { asPath } = useRouter();
  const currentOrganization = useCurrentOrganization();
  const canManageOrganization = useCurrentUserPermission([MANAGE_ORGANIZATION]);
  const currentUserHasRole = useCurrentUserHasMinimumRole();

  const organizationDisplayName = currentOrganization?.displayName;
  const { personal, organization } = SETTINGS_NAV_ITEMS;
  const personalItems = personal.filter(
    ({ minimumRole }) => !minimumRole || currentUserHasRole(minimumRole as Role)
  );

  return (
    <Box>
      <List
        subheader={
          <ListSubheader sx={{ fontSize: 16 }}>Personal</ListSubheader>
        }
      >
        <SettingsNavItems items={personalItems} currentPath={asPath} />
      </List>
      {canManageOrganization && (
        <List
          subheader={
            <ListSubheader sx={{ fontSize: 16 }}>
              {organizationDisplayName}
            </ListSubheader>
          }
        >
          <SettingsNavItems items={organization} currentPath={asPath} />
        </List>
      )}
    </Box>
  );
}

function SettingsNavItems({ currentPath, items }) {
  const renderSubItems = (subItems, parentId) =>
    subItems.map(({ href, id, label }) => (
      <SettingsNavItem
        selected={currentPath.startsWith(href)}
        label={label} // Indentation for sub-items
        id={`${parentId}_${id}`}
        key={`${parentId}_${id}`}
        href={href}
        isSubItem
      />
    ));

  return items.map(({ href, id, label, subItems }) => (
    <div key={id}>
      <SettingsNavItem
        selected={currentPath === href}
        label={label}
        id={id}
        key={id}
        href={href}
        isSubItem={false}
      />
      {subItems && renderSubItems(subItems, id)}
    </div>
  ));
}

function SettingsNavItem({ selected, href, id, label, isSubItem }) {
  return (
    <ListItem sx={isSubItem ? { paddingLeft: '4rem' } : {}}>
      <Link href={href}>
        <ListItemButton selected={selected}>
          <ListItemText id={id} primary={label} />
        </ListItemButton>
      </Link>
    </ListItem>
  );
}
