import { Box, EmptyState } from '@fiftyone/teams-components';
import {
  groupSearchInputState,
  groupSearchTermState
} from '@fiftyone/teams-state';
import { Typography } from '@mui/material';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { useRecoilValue, useResetRecoilState } from 'recoil';

export default function EmptyGroups() {
  const theme = useTheme();
  const searchTerm = useRecoilValue(groupSearchTermState);
  const resetSearch = useResetRecoilState(groupSearchInputState);
  const resetGroupSearchTerm = useResetRecoilState(groupSearchTermState);
  const isSearchOrFilterActive = Boolean(searchTerm?.term);

  if (!isSearchOrFilterActive) {
    return <EmptyState resource="groups" />;
  }
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      height="70vh"
      flexDirection="column"
      sx={{ background: (theme.palette.grey as any)[25], marginTop: 2 }}
    >
      <Typography variant="body2">No groups found with your search</Typography>
      <Button
        variant="outlined"
        sx={{ margin: 2 }}
        onClick={() => {
          resetSearch();
          resetGroupSearchTerm();
        }}
      >
        Reset search
      </Button>
    </Box>
  );
}
