import { Paper, PaperProps } from "@mui/material";
import React, { PropsWithChildren } from "react";
import { ViewPropsType } from "../utils/types";

export default function ContainerizedComponent(props: ContainerizedComponent) {
  const { schema, children } = props;
  const container = schema?.view?.container;
  if (container) {
    const Container = containersByName[container.name];
    if (Container) {
      return <Container {...container}>{children}</Container>;
    } else {
      console.warn(`Container ${container.name} can not be found`);
    }
  }

  return children;
}

function PaperContainer(props: PaperContainerProps) {
  const { elevation = 1, children, ...paperProps } = props;
  return (
    <Paper sx={{ p: 1, m: 0.5 }} elevation={elevation} {...paperProps}>
      {children}
    </Paper>
  );
}

function OutlinedContainer(props: PaperContainerProps) {
  return <PaperContainer {...props} variant="outlined" elevation={0} />;
}

const containersByName = { PaperContainer, OutlinedContainer };

type ContainerizedComponent = PropsWithChildren<ViewPropsType>;

type PaperContainerProps = PropsWithChildren<PaperProps>;
