import { GridProps } from '@mui/material';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import React from 'react';

const MAX_WIDTH = 'lg';
const DEFAULT_SPACING = 2;

export function MainLayout({ children }) {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        bgcolor: 'background.secondary'
      }}
    >
      <Container disableGutters maxWidth={false} sx={{ flexWrap: 'nowrap' }}>
        <Grid container>{children}</Grid>
      </Container>
    </Box>
  );
}

export const MainColumn = React.memo(
  ({
    children,
    paddingLeft = 0,
    paddingRight = 0,
    marginLeft = 0,
    overflow = 'auto',
    size = {}
  }) => {
    return (
      /* margin is for the fixed left nav bar - alternative is to make body scrollable
    to keep navbar fixed to the left. might be better way @TODO:MANI */
      <Grid
        paddingLeft={paddingLeft}
        paddingRight={paddingRight}
        marginLeft={marginLeft}
        overflow={overflow}
        width="100%"
        {...size}
      >
        {children}
      </Grid>
    );
  }
);

export function SideBarColumn({ children }) {
  return <Grid>{children}</Grid>;
}

export function MainBar({ children }) {
  return children;
}

export function MultiColLayout({ children }) {
  return (
    <Grid container spacing={DEFAULT_SPACING} margin={0} width="100%">
      {children}
    </Grid>
  );
}

export function SecondaryColumn({ size, children }) {
  return <Grid {...size}>{children}</Grid>;
}

type SidePanelLayoutProps = {
  children?: Array<JSX.Element>;
  reverse?: boolean;
  sideGridProps?: GridProps;
  mainGridProps?: GridProps;
  containerProps?: GridProps;
};

export function SidePanelLayout(props: SidePanelLayoutProps) {
  const {
    children,
    reverse,
    sideGridProps = {},
    mainGridProps = {},
    containerProps = {}
  } = props;
  const containers = [...children];
  const sizeProps = [
    { xs: 12, sm: 4, md: 3 },
    { xs: 12, sm: 8, md: 9 }
  ];

  if (reverse) {
    containers.reverse();
    sizeProps.reverse();
  }

  const [side, main] = containers;
  const [leftSizeProps, rightSizeProps] = sizeProps;

  return (
    <Grid container sx={{ px: 2 }} {...containerProps}>
      <Grid item {...leftSizeProps} {...sideGridProps}>
        {side}
      </Grid>
      <Grid item {...rightSizeProps} {...mainGridProps}>
        {main}
      </Grid>
    </Grid>
  );
}
