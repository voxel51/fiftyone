import React from "react";
import { AiOutlineHome, AiOutlineUser } from "react-icons/ai";
import { usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";

import Logo from "../images/logo.png";
import { RouteComponent } from "../routing";
import Link from "../routing/Link";
import { routingContext } from "../routing/RoutingContext";

import {
  container,
  entries,
  activeEntry,
  heading,
  nav,
} from "./index.module.css";
import { RootQuery } from "./__generated__/RootQuery.graphql";

interface Entry {
  to: string;
  name: string;
  icon: JSX.Element;
}

const navEntries: Entry[] = [
  {
    to: "/",
    name: "Home",
    icon: <AiOutlineHome />,
  },
  {
    to: "/users",
    name: "Users",
    icon: <AiOutlineUser />,
  },
];

const navEntryPaths = navEntries.map(({ to }) => to);

interface NavEntryProps extends Entry {
  active: boolean;
}

const NavEntry: React.FC<NavEntryProps> = ({ name, to, icon, active }) => {
  return (
    <Link title={name} className={active ? activeEntry : ""} to={to}>
      {icon}
      <span>{name}</span>
    </Link>
  );
};

const Nav: React.FC = () => {
  const context = useRecoilValue(routingContext);
  const active = navEntryPaths
    .filter((path) => context?.get().pathname.startsWith(path))
    .reduce((nearest, current) => {
      return current.length > nearest.length ? current : nearest;
    }, "/");

  return (
    <div className={nav}>
      <div className={heading}>
        <img src={Logo} />
        <div>
          <span>FiftyOne Teams</span>
        </div>
      </div>
      <div className={entries}>
        {navEntries.map((props) => (
          <NavEntry key={props.name} active={active === props.to} {...props} />
        ))}
      </div>
    </div>
  );
};

const Root: RouteComponent<RootQuery> = ({ children, prepared }) => {
  const {
    viewer: { id },
  } = usePreloadedQuery(
    graphql`
      query RootQuery {
        viewer {
          id
        }
      }
    `,
    prepared
  );

  return (
    <div className={container}>
      <Nav />
      <div>{children}</div>
    </div>
  );
};

export default Root;
