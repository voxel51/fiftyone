import React, { useContext, useState } from "react";
import {
  AiOutlineDatabase,
  AiOutlineHome,
  AiOutlineUser,
} from "react-icons/ai";
import { usePreloadedQuery } from "react-relay";
import { graphql } from "relay-runtime";

import Logo from "../images/logo.png";
import { RouteComponent } from "../routing";
import Link from "../routing/Link";
import RoutingContext from "../routing/RoutingContext";

import {
  container,
  entries,
  activeEntry,
  heading,
  nav,
} from "./index.module.css";

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
    to: "/datasets",
    name: "Datasets",
    icon: <AiOutlineDatabase />,
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
  console.log(to, active);
  return (
    <Link title={name} className={active ? activeEntry : ""} to={to}>
      {icon}
      <span>{name}</span>
    </Link>
  );
};

const Nav: React.FC = () => {
  const context = useContext(RoutingContext);
  const active = navEntryPaths
    .filter((path) => context.get().pathname.startsWith(path))
    .reduce((nearest, current) => {
      return current.length > nearest.length ? current : nearest;
    }, "/");
  console.log(active);
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
          <NavEntry active={active === props.to} {...props} />
        ))}
      </div>
    </div>
  );
};

const Root: RouteComponent = ({ children, prepared }) => {
  const data = usePreloadedQuery(
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
