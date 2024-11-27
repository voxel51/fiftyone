import { Box } from "@fiftyone/teams-components";
import {
  isSearchOrFiltersSelector,
  userSearchInputState,
  userSearchTermState,
} from "@fiftyone/teams-state";
import { Typography } from "@mui/material";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import { useRouter } from "next/router";
import { useRecoilValue, useResetRecoilState } from "recoil";

export default function EmptyUsers() {
  const theme = useTheme();
  const router = useRouter();
  const isSearchOrFilterActive = useRecoilValue<boolean>(
    isSearchOrFiltersSelector
  );
  const resetSearch = useResetRecoilState(userSearchInputState);
  const resetUserSearchTerm = useResetRecoilState(userSearchTermState);

  const title = isSearchOrFilterActive
    ? "No users found with your search"
    : "No users yet";

  const subTitle = isSearchOrFilterActive ? (
    <Button
      variant="outlined"
      sx={{ margin: 2 }}
      onClick={() => {
        resetSearch();
        resetUserSearchTerm();
      }}
    >
      Reset search and filters
    </Button>
  ) : (
    "Click “Invite” to start adding users"
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
