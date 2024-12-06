import { useBooleanEnv, useCurrentOrganization } from "@fiftyone/hooks";
import { DatasetPin, ProfileMenu } from "@fiftyone/teams-components";
import {
  CONSTANT_VARIABLES,
  datasetListCountState,
  hideHeaders,
  hostState,
  mainTitleSelector,
  showReadonlyDatasetIndicator,
  useCurrentDataset,
} from "@fiftyone/teams-state";
import { Lock } from "@mui/icons-material";
import ArrowForwardIosOutlinedIcon from "@mui/icons-material/ArrowForwardIosOutlined";
import { Box, Grid, Link, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Head from "next/head";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import Workflows from "../Workflows";
import { FIFTYONE_APP_ENABLE_WORKFLOWS_ENV_KEY } from "@fiftyone/teams-state/src/constants";

const { COMPANY_NAME } = CONSTANT_VARIABLES;

export default function MainTitle({ noBorder }) {
  const theme = useTheme();

  const mainTitle = useRecoilValue(mainTitleSelector);
  const currentOrganization = useCurrentOrganization();
  const organizationDisplayName = currentOrganization?.displayName;

  // TODO:MANI: can be done more elegant using state
  const router = useRouter();
  const datasetCount = useRecoilValue(datasetListCountState);
  const { slug: datasetSlug } = router.query;
  const isDatasetDetailPage = !!datasetSlug;
  const currentDataset = useCurrentDataset(datasetSlug as string);
  const hideHeadersState = useRecoilValue(hideHeaders);
  const setHost = useSetRecoilState<string>(hostState);
  const showReadonlyDatasetIndicatorState = useRecoilValue(
    showReadonlyDatasetIndicator
  );
  const enableWorkflows = useBooleanEnv(FIFTYONE_APP_ENABLE_WORKFLOWS_ENV_KEY);

  useEffect(
    () => {
      const origin =
        typeof window !== "undefined" && window.location.origin
          ? window.location.origin
          : "";
      setHost(origin);
    },
    [
      /* keep this dependency-less */
    ]
  );

  if (hideHeadersState) return null;
  const showDatasetCount = router.pathname.endsWith("/datasets");

  return (
    <Grid
      container
      borderBottom={noBorder ? 0 : 1}
      borderColor={theme.palette.divider}
      bgcolor={theme.palette.background.primary}
      py={0.5}
      paddingLeft={2}
      paddingRight="11px" // subtracting 5px for profile icon padding
      alignItems="center"
    >
      <Head>
        <title>
          {mainTitle} - {COMPANY_NAME}
        </title>
      </Head>
      <Grid
        item
        xs={6}
        display="flex"
        flexDirection="row"
        alignItems="center"
        data-cy="main-title"
      >
        <NextLink href="/datasets" passHref>
          <Link sx={{ pr: 2, lineHeight: 0 }}>
            <img
              data-cy="main-title-logo"
              src="/logo-color.png"
              alt="logo"
              height={28.8}
              width={28.8}
            />
          </Link>
        </NextLink>
        <Box display="flex" alignItems="center">
          <NextLink href="/datasets" passHref>
            <Link style={{ textDecoration: "none" }}>
              <Typography
                variant="body2"
                fontWeight="light"
                fontSize={24}
                maxWidth="300px"
                height="100%"
                color="text.secondary"
                noWrap
              >
                {organizationDisplayName}
              </Typography>
            </Link>
          </NextLink>

          <Box
            display="flex"
            paddingX={1}
            fontSize={12}
            color={(theme) => theme.palette.text.tertiary}
            alignItems="center"
          >
            <ArrowForwardIosOutlinedIcon
              fontSize="inherit"
              color="inherit"
              sx={{ verticalAlign: "middle" }}
            />
          </Box>
        </Box>
        <Typography
          variant="body2"
          fontWeight="medium"
          fontSize={24}
          noWrap
          height="100%"
          data-cy={"main-title-text"}
        >
          {mainTitle}
        </Typography>
        {isDatasetDetailPage && (
          // TODO: explore nextjs layout for pluggable solution
          <Box sx={{ cursor: "pointer", ml: 1.5, height: "100%", mt: 0.5 }}>
            {currentDataset && (
              <DatasetPin
                row={currentDataset}
                fontSize="1.3em"
                isHovering={true}
              />
            )}
          </Box>
        )}
        {showReadonlyDatasetIndicatorState && (
          <Tooltip title="Read-only mode" sx={{ ml: 1 }}>
            <Lock color="voxel" />
          </Tooltip>
        )}
        {showDatasetCount && (
          <Box pl={1} display="flex" alignItems="center" height="100%" pt={1}>
            <Typography variant="subtitle1">
              {datasetCount.toLocaleString()}
            </Typography>
          </Box>
        )}
      </Grid>
      <Grid item xs={6}>
        <Box display="flex" justifyContent="end" alignItems="center">
          {enableWorkflows && <Workflows />}
          <ProfileMenu />
        </Box>
      </Grid>
    </Grid>
  );
}
