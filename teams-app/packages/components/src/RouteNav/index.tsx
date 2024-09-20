import {
  List,
  ListSubheader,
  ListItem,
  ListItemText,
  ListItemButton
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/router';

type Route = {
  label: string;
  id: string;
  href: string;
};

type RouteNavProps = {
  selected?: string;
  routes: Route[];
  header?: string;
};

export default function RouteNav(props: RouteNavProps) {
  const { asPath } = useRouter();
  const { header, routes, selected } = props;

  return (
    <List
      sx={{ width: '100%', maxWidth: 360 }}
      subheader={header && <ListSubheader>{header}</ListSubheader>}
    >
      {routes.map((route) => {
        const isSelected = selected
          ? selected === route.id
          : asPath === route.href;
        return <RouteNavItem {...route} selected={isSelected} />;
      })}
    </List>
  );
}

function RouteNavItem({ selected, href, id, label }) {
  return (
    <ListItem>
      <Link href={href}>
        <ListItemButton selected={selected}>
          <ListItemText id={id} primary={label} />
        </ListItemButton>
      </Link>
    </ListItem>
  );
}
