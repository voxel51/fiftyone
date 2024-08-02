import { Box, Paper, PaperProps } from "@mui/material";
import React, { PropsWithChildren } from "react";
import {
  getMarginSx,
  getPaddingSx,
  isCompositeView,
  overlayToSx,
} from "../utils";
import { ViewPropsType } from "../utils/types";

export default function ContainerizedComponent(props: ContainerizedComponent) {
  const { schema, children } = props;
  const container = schema?.view?.container;
  let containerizedChildren = children;
  if (container) {
    const Container = containersByName[container.name];
    if (Container) {
      containerizedChildren = <Container {...container}>{children}</Container>;
    } else {
      console.warn(`Container ${container.name} can not be found`);
    }
  }

  if (isCompositeView(schema)) {
    const sxForOverlay = overlayToSx[schema?.view?.overlay] || {};
    return (
      <Box sx={{ position: "relative", ...sxForOverlay }}>
        {containerizedChildren}
      </Box>
    );
  }

  return containerizedChildren;
}

function PaperContainer(props: PaperContainerProps) {
  const { elevation = 1, children, rounded = true, ...paperProps } = props;
  const roundedSx = rounded ? {} : { borderRadius: 0 };
  const paddingSx = getPaddingSx(props);
  const marginSx = getMarginSx(props);
  return (
    <Paper
      sx={{ p: 1, m: 0.5, ...roundedSx, ...paddingSx, ...marginSx }}
      elevation={elevation}
      {...paperProps}
    >
      {children}
    </Paper>
  );
}

function OutlinedContainer(props: PaperContainerProps) {
  return <PaperContainer {...props} variant="outlined" elevation={0} />;
}

const containersByName = { PaperContainer, OutlinedContainer };

type ContainerizedComponent = PropsWithChildren<ViewPropsType>;

type PaperContainerProps = PropsWithChildren<
  PaperProps & { rounded?: boolean }
>;
