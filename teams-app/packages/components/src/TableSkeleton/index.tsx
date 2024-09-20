import { Box, Skeleton, SkeletonProps, BoxProps } from '@mui/material';

type TableSkeletonProps = {
  rows?: number;
  skeletonProps?: SkeletonProps;
  containerProps?: BoxProps;
};

export default function TableSkeleton({
  rows = 3,
  skeletonProps = {},
  containerProps = {}
}: TableSkeletonProps) {
  const skeletonItems = Array(rows).fill('');
  return (
    <Box {...containerProps}>
      {skeletonItems.map((i, index: number) => (
        <Skeleton key={index} height={64} width="100%" {...skeletonProps} />
      ))}
    </Box>
  );
}
