import React, { Suspense, useContext, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import ReactGA from "react-ga";
import { motion, AnimatePresence } from "framer-motion";
import "antd/dist/antd.css";

import {
  PreloadedQuery,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilState, useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";
import i18next from "../utils/i18n";

import { setLangType } from "../utils/lang";
import { Menu, Dropdown } from "antd";
// import LangTriggerIcon from "../images/lang-trigger.svg";

import { Header, iconContainer } from "@fiftyone/components";
import Icon from "@ant-design/icons";

// built in plugins
import "@fiftyone/map";
import "@fiftyone/looker-3d";
import "@fiftyone/embeddings";

import gaConfig from "../ga";
import style from "./Root.module.css";
import ViewBar from "../components/ViewBar/ViewBar";
import Teams from "../components/Teams/Teams";

import { RootQuery } from "./__generated__/RootQuery.graphql";
import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootGA_query$key } from "./__generated__/RootGA_query.graphql";
import { RootNav_query$key } from "./__generated__/RootNav_query.graphql";
import { isElectron } from "@fiftyone/utilities";
import * as fos from "@fiftyone/state";
import { getDatasetName, Route, RouterContext } from "@fiftyone/state";

import DatasetSelector from "../components/DatasetSelector";
import { useColorScheme, IconButton } from "@mui/material";
import { DarkMode, LightMode } from "@mui/icons-material";

const rootQuery = graphql`
  query RootQuery($search: String = "", $count: Int, $cursor: String) {
    ...RootDatasets_query
    ...RootGA_query
    ...RootNav_query
  }
`;

const getUseSearch = (prepared: PreloadedQuery<RootQuery>) => {
  const refresh = useRecoilValue(fos.refresher);

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
                # can the view selector reuse the savedViews {} fragment?
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
        total: data.datasets.total === null ? undefined : data.datasets.total,
        values: data.datasets.edges.map((edge) => edge.node.name),
      };
    }, [data]);
  };
};

export const useGA = (prepared: PreloadedQuery<RootQuery>) => {
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

  const info = useFragment(
    graphql`
      fragment RootGA_query on Query {
        context
        dev
        doNotTrack
        uid
        version
      }
    `,
    query as RootGA_query$key
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
    ReactGA.pageview("/");
  }, []);
};

const Nav: React.FC<{ prepared: PreloadedQuery<RootQuery> }> = ({
  prepared,
}) => {
  useGA(prepared);
  const useSearch = getUseSearch(prepared);
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

  const { teamsSubmission } = useFragment(
    graphql`
      fragment RootNav_query on Query {
        teamsSubmission
      }
    `,
    query as RootNav_query$key
  );
  const [teams, setTeams] = useRecoilState(fos.appTeamsIsOpen);
  const refresh = fos.useRefresh();
  const context = useContext(RouterContext);
  const dataset = getDatasetName(context);
  const { mode, setMode } = useColorScheme();
  const [_, setTheme] = useRecoilState(fos.theme);
  const LangTrigger = React.memo(
    (): JSX.Element => (
      <svg
        viewBox="0 0 24 24"
        focusable="false"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M0 0h24v24H0z" fill="none"></path>
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z "></path>
      </svg>
    )
  );

  const langMenu = (
    <Menu className={style.menu}>
      <Menu.Item
        key="lng-chinese"
        onClick={(): void => {
          // false positive
          // eslint-disable-next-line
          i18next.changeLanguage("zh-CN");
          setLangType("zh-CN");
        }}
      >
        中文（Chinese)
      </Menu.Item>
      <Menu.Item
        key="lng-english"
        onClick={(): void => {
          i18next.changeLanguage("en");
          setLangType("en");
        }}
      >
        English
      </Menu.Item>
    </Menu>
  );
  return (
    <>
      <Header
        title={"FiftyOne"}
        onRefresh={refresh}
        navChildren={<DatasetSelector useSearch={useSearch} />}
      >
        {dataset && <ViewBar />}
        {!dataset && <div style={{ flex: 1 }}></div>}
        <Dropdown
          placement="bottomRight"
          overlay={langMenu}
          className={style.dropdown}
        >
          <Icon component={LangTrigger} />
        </Dropdown>
        {/* <div className={iconContainer}> */}
        {/* {!teamsSubmission && (
            <Button
              onClick={() => {
                setTeams(true);
              }}
            >
              Have a Team?
            </Button>
          )} */}
        {/* <IconButton
            title={mode === "dark" ? "Light mode" : "Dark mode"}
            disableRipple
            onClick={() => {
              const nextMode = mode === "dark" ? "light" : "dark";
              setMode(nextMode);
              setTheme(nextMode);
            }}
            sx={{
              color: (theme) => theme.palette.text.secondary,
              pr: 0,
            }}
          >
            {mode === "dark" ? <LightMode color="inherit" /> : <DarkMode />}
          </IconButton> */}
        {/* <SlackLink />
          <GitHubLink />
          <DocsLink /> */}
        {/* </div> */}
      </Header>
      {ReactDOM.createPortal(
        <AnimatePresence>
          {teams && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: 1,
                height: "auto",
              }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              key={"teams"}
            >
              <Teams />
            </motion.div>
          )}
        </AnimatePresence>,
        document.getElementById("teams")
      )}
    </>
  );
};

const Root: Route<RootQuery> = ({ children, prepared }) => {
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
