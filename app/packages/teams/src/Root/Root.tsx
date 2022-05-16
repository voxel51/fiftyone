import React, {
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import ReactGA from "react-ga";
import {
  PreloadedQuery,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";

import {
  DocsLink,
  GitHubLink,
  Header,
  SlackLink,
  iconContainer,
  Route,
  Link,
  RouterContext,
} from "@fiftyone/components";

import gaConfig from "@fiftyone/app/src/ga";
import ViewBar from "@fiftyone/app/src/components/ViewBar/ViewBar";
import style from "./Root.module.css";

import { RootQuery } from "./__generated__/RootQuery.graphql";
import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { isElectron } from "@fiftyone/utilities";
import { useSetDataset, useStateUpdate } from "@fiftyone/app/src/utils/hooks";
import { refresher, useRefresh } from "@fiftyone/app/src/recoil/atoms";
import { getDatasetName } from "@fiftyone/app/src/utils/generic";
import { RootConfig_query$key } from "./__generated__/RootConfig_query.graphql";

const rootQuery = graphql`
  query RootQuery($search: String = "", $count: Int = 10, $cursor: String) {
    ...RootConfig_query
    ...RootDatasets_query
    ...RootGA_query
  }
`;

const getUseSearch = (prepared: PreloadedQuery<RootQuery>) => {
  const refresh = useRecoilValue(refresher);

  return (search: string) => {
    const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

    const { data, refetch } = usePaginationFragment(
      graphql`
        fragment RootDatasets_query on Query
          @refetchable(queryName: "DatasetsPaginationQuery") {
          datasets(search: $search, first: $count, after: $cursor)
            @connection(key: "DatasetsList_query_datasets") {
            total
            edges {
              cursor
              node {
                name
              }
            }
          }
        }
      `,
      query as RootDatasets_query$key
    );

    useDebounce(
      () => {
        refetch({ search });
      },
      200,
      [search, refresh]
    );

    return useMemo(() => {
      return {
        total: data.datasets.total,
        values: data.datasets.edges.map((edge) => edge.node.name),
      };
    }, [data]);
  };
};

const DatasetLink: React.FC<{ value: string; className: string }> = ({
  className,
  value,
}) => {
  return (
    <Link title={value} className={className}>
      {value}
    </Link>
  );
};

export const useGA = (prepared: PreloadedQuery<RootQuery>) => {
  const [gaInitialized, setGAInitialized] = useState(false);
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

  const info = useFragment(
    graphql`
      fragment RootGA_query on Query {
        dev
        version
      }
    `,
    query
  );

  useEffect(() => {
    if (info.doNotTrack) {
      return;
    }
    const dev = info.dev;
    const buildType = dev ? "dev" : "prod";

    ReactGA.initialize(gaConfig.app_ids[buildType], {
      debug: dev,
      gaOptions: {
        storage: "none",
        cookieDomain: "none",
        clientId: info.uid,
      },
    });
    ReactGA.set({
      userId: info.uid,
      checkProtocolTask: null, // disable check, allow file:// URLs
      [gaConfig.dimensions.dev]: buildType,
      [gaConfig.dimensions.version]: `${info.version}`,
      [gaConfig.dimensions.context]:
        info.context + (isElectron() ? "-DESKTOP" : ""),
    });
    setGAInitialized(true);
  }, []);
};

const Nav: React.FC<{ prepared: PreloadedQuery<RootQuery> }> = ({
  prepared,
}) => {
  useGA(prepared);
  const useSearch = getUseSearch(prepared);
  const refresh = useRefresh();
  const setDataset = useSetDataset();
  const context = useContext(RouterContext);
  const dataset = getDatasetName(context);

  return (
    <>
      <Header
        title={"FiftyOne Teams"}
        onRefresh={() => {
          refresh();
        }}
        datasetSelectorProps={{
          component: DatasetLink,
          onSelect: (name) => {
            setDataset(name);
          },
          placeholder: "Select dataset",
          useSearch,
          value: dataset || "",
        }}
      >
        {dataset && <ViewBar />}
        {!dataset && <div style={{ flex: 1 }}></div>}
        <div className={iconContainer}>
          <SlackLink />
          <GitHubLink />
          <DocsLink />
        </div>
      </Header>
    </>
  );
};

const Root: Route<RootQuery> = ({ children, prepared }) => {
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);
  const { config, colorscale } = useFragment(
    graphql`
      fragment RootConfig_query on Query {
        config {
          colorBy
          colorPool
          colorscale
          gridZoom
          loopVideos
          showConfidence
          showIndex
          showLabel
          showTooltip
          timezone
          useFrameNumber
        }
        colorscale
      }
    `,
    query as RootConfig_query$key
  );

  const update = useStateUpdate();
  useEffect(() => {
    update({ state: { config, colorscale } });
  }, []);

  return (
    <>
      <Nav prepared={prepared} />
      <div className={style.page}>
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </>
  );
};

export default Root;
