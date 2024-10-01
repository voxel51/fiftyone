import { Box, BoxProps } from '@mui/material';

export default function Container({ children, ...props }: BoxProps) {
  return (
    <Box
      {...props}
      sx={{
        padding: 2,
        borderColor: (theme) => theme.palette.divider,
        borderRadius: 1,
        '& tr:last-child td': {
          border: 'none'
        },
        backgroundColor: (theme) => theme.palette.background.primary,
        boxShadow: (theme) => theme.voxelShadows.sm,
        ...(props?.sx || {})
      }}
    >
      {children}
    </Box>
  );
}
