import { Avatar, Box, Typography } from '@mui/material';
import ExtensionIcon from '@mui/icons-material/Extension';

type EmptyStateProps = {
  resource?: string;
  title?: string;
  description?: string;
};

export default function EmptyState(props: EmptyStateProps) {
  const { resource = 'items', title, description } = props;
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingY: 4,
        bgcolor: (theme) => theme.palette.background.primary,
        borderRadius: 1,
        boxShadow: (theme) => theme.voxelShadows.sm
      }}
    >
      <Avatar sx={{ marginBottom: 2, height: 72, width: 72, fontSize: 32 }}>
        <ExtensionIcon fontSize="inherit" />
      </Avatar>
      <Box textAlign="center">
        <Typography variant="body1">{title || `No ${resource} yet`}</Typography>
        {description && (
          <Typography variant="body1" color="text.tertiary">
            {description}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
