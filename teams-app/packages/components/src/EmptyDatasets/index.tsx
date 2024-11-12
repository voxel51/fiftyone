import { useCurrentUser, useCurrentUserPermission } from "@fiftyone/hooks";
import {
  CREATE_DATASETS,
  isSearchOrFiltersSelector,
} from "@fiftyone/teams-state";
import { Box } from "@fiftyone/teams-components";
import { Typography } from "@mui/material";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import { capitalize } from "lodash";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { useRouter } from "next/router";
import useDatasetsFilter from "@fiftyone/hooks/src/datasets/DatasetList/useFilters";

export default function EmptyDatasets() {
  const theme = useTheme();
  const router = useRouter();
  const isSearchOrFilterActive = useRecoilValue<boolean>(
    isSearchOrFiltersSelector
  );
  const canCreateDataset = useCurrentUserPermission([CREATE_DATASETS]);
  const [{ role }] = useCurrentUser();
  const roleLabel = capitalize(role);
  const { resetCreatedByUser } = useDatasetsFilter();

  const handleSearchFilterResetClick = useCallback(() => {
    resetCreatedByUser();
    router.push({
      query: {},
    });
  }, [router]);

  const { createDatasetNote, title } = useMemo(() => {
    const createDatasetNote = canCreateDataset
      ? "Click “New dataset” to start adding data"
      : "";

    const noDatasetNote = canCreateDataset
      ? "No datasets yet"
      : `${roleLabel}s can only access datasets shared with them`;

    const title = isSearchOrFilterActive
      ? "No dataset found with your search"
      : noDatasetNote;

    return { createDatasetNote, noDatasetNote, title };
  }, [canCreateDataset, isSearchOrFilterActive]);

  const subTitle = isSearchOrFilterActive ? (
    <Button
      variant="outlined"
      sx={{ margin: 2 }}
      onClick={handleSearchFilterResetClick}
    >
      Reset search and filters
    </Button>
  ) : (
    createDatasetNote
  );

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      height="70vh"
      flexDirection="column"
      sx={{ background: (theme.palette.grey as any)[25], marginTop: 2 }}
    >
      <Typography variant="body2">{title}</Typography>
      <Typography variant="subtitle1">{subTitle}</Typography>
    </Box>
  );
}
