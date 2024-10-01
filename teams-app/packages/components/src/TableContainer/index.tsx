import { TableContainer as MUITableContainer } from '@mui/material';

type TableContainerProps = {
  children: JSX.Element;
};

export default function TableContainer({ children }: TableContainerProps) {
  return (
    <MUITableContainer
      sx={{
        borderColor: (theme) => theme.palette.divider,
        borderRadius: 1,
        '& tr:last-child td': {
          border: 'none'
        },
        backgroundColor: (theme) => theme.palette.background.primary,
        boxShadow: (theme) => theme.voxelShadows.sm
      }}
    >
      {children}
    </MUITableContainer>
  );
}
