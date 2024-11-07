import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { Box, Paper, PaperProps } from "@mui/material";
import { PropsWithChildren } from "react";
import {
  getMarginSx,
  getPaddingSx,
  isCompositeView,
  overlayToSx,
} from "../utils";
import { ViewPropsType } from "../utils/types";

export default function ContainerizedComponent(props: ContainerizedComponent) {
  const { schema, children, path } = props;
  const container = schema?.view?.container;
  let containerizedChildren = children;
  if (container) {
    const Container = containersByName[container.name];
    if (Container) {
      containerizedChildren = (
        <Container {...container} path={path}>
          {children}
        </Container>
      );
    } else {
      console.warn(`Container ${container.name} can not be found`);
    }
  }

  if (isCompositeView(schema)) {
    const hasOverlay = !!schema?.view?.overlay;
    const sxForOverlay = overlayToSx[schema?.view?.overlay] || {};
    if (hasOverlay) {
      sxForOverlay.zIndex = 999;
    }
    return (
      <Box sx={{ position: "relative", ...sxForOverlay }}>
        {containerizedChildren}
      </Box>
    );
  }

  return containerizedChildren;
}

function PaperContainer(props: PaperContainerProps) {
  const {
    elevation = 1,
    children,
    rounded = true,
    on_click,
    params = {},
    path,
    prompt,
    ...paperProps
  } = props;
  const panelId = usePanelId();
  const handleClick = usePanelEvent();
  const computedParams = { ...params, path };
  const roundedSx = rounded ? {} : { borderRadius: 0 };
  const paddingSx = getPaddingSx(props);
  const marginSx = getMarginSx(props);
  const hoverProps = on_click
    ? {
        "&:hover": {
          cursor: "pointer",
          backgroundColor: (theme) => theme.palette.action.hover,
        },
      }
    : {};

  return (
    <Paper
      sx={{
        p: 1,
        m: 0.5,
        transition: "background 0.25s ease",
        ...roundedSx,
        ...paddingSx,
        ...marginSx,
        ...hoverProps,
      }}
      elevation={elevation}
      onClick={() => {
        if (on_click) {
          handleClick(panelId, {
            params: computedParams,
            operator: on_click,
            prompt,
          });
        }
      }}
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
  PaperProps & { rounded?: boolean; [key: string]: any }
>;
