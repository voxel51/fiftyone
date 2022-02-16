import { useAuth0 } from "@auth0/auth0-react";
import { State } from "@fiftyone/app/src/recoil/types";
import { useStateUpdate } from "@fiftyone/app/src/utils/hooks";
import { clone } from "@fiftyone/utilities";
import React, { Suspense, useEffect } from "react";
import { AiOutlineDatabase, AiOutlineUser } from "react-icons/ai";
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
  page,
  profile,
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
  const { logout } = useAuth0();

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
      <div className={profile}>Hi, Ben</div>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
};

const DatasetCard: React.FC<{ dataset: DatasetsListingCard_dataset$key }> = (
  props
) => {
  const { name, id } = useFragment(
    graphql`
      fragment DatasetsListingCard_dataset on Dataset {
        id
        name
        sampleFields {
          path
        }
      }
    `,
    props.dataset
  );
  return (
    <Link title={name} className={datasetCard} to={`datasets/${name}`}>
      <h1>{name}</h1>
      <p>{id}</p>
    </Link>
  );
};

const DatasetListingComponent: React.FC<{
  datasets: DatasetsListingComponent_query$key;
}> = (props) => {
  const { data, refetch } = usePaginationFragment(
    graphql`
      fragment DatasetsListingComponent_query on Query
        @refetchable(queryName: "DatasetsPaginationQuery") {
        datasets(first: $count, after: $cursor)
          @connection(key: "DatasetsList_query_datasets") {
          edges {
            cursor
            node {
              ...DatasetsListingCard_dataset
            }
          }
        }
      }
    `,
    props.datasets
  );

  return (
    <div className={datasetListing}>
      {data.datasets.edges.map((edge) => {
        if (edge == null || edge.node == null) {
          return null;
        }
        return <DatasetCard dataset={edge.node} key={edge.cursor} />;
      })}
    </div>
  );
};

const Header = () => {};

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

  const state: State.Description = {
    view: [],
    selected: [],
    selectedLabels: [],
    close: false,
    refresh: false,
    connected: true,
    viewCls: null,
    datasets: data.datasets.edges.map(({ node }) => node.name),
    config: {
      ...clone(data.viewer.config),
    },
    activeHandle: null,
    colorscale: clone(data.viewer.colorscale) || [],
  };

  const update = useStateUpdate();

  useEffect(() => {
    update({ state });
  }, [state]);

  return (
    <div className={container}>
      <div className={page}>
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </div>
  );
};

export default Root;
