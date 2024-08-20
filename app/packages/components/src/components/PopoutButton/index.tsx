import { useTheme } from "@fiftyone/components";
import { useOutsideClick } from "@fiftyone/state";
import { Box, BoxProps, SxProps } from "@mui/material";
import React, { PropsWithChildren } from "react";

export default function PopoutButton(props: PopoutButtonPropsType) {
  const { Button, children, containerProps, popoutProps, open, onClose } =
    props;
  const [localOpen, setLocalOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useOutsideClick(containerRef, () => {
    setLocalOpen(false);
    onClose?.();
  });

  return (
    <Box ref={containerRef} {...containerProps}>
      <Box
        onClick={() => {
          setLocalOpen(!localOpen);
          if (open) {
            onClose?.();
          }
        }}
      >
        {Button}
      </Box>
      {(open ?? localOpen) && (
        <Popout anchor={containerRef} {...popoutProps}>
          {children}
        </Popout>
      )}
    </Box>
  );
}

function Popout(props: PopoutPropsType) {
  const { sx = {}, anchor } = props;
  const theme = useTheme();
  const anchorElem = anchor?.current;
  let positionSx: SxProps = {};
  if (anchorElem) {
    const rect = anchorElem.getBoundingClientRect();
    positionSx = {
      position: "fixed",
      left: rect.left,
      top: rect.top + rect.height + 8,
    };
  }
  return (
    <Box
      {...props}
      sx={{
        zIndex: 1501,
        backgroundColor: theme.background.level2,
        border: `1px solid ${theme.primary.plainBorder}`,
        p: 0.5,
        boxShadow: theme.custom.shadow,
        ...positionSx,
        ...sx,
      }}
    />
  );
}

type PopoutPropsType = BoxProps & {
  anchor?: React.RefObject<HTMLElement>;
};

type PopoutButtonPropsType = PropsWithChildren<{
  Button: React.ReactNode;
  containerProps?: BoxProps;
  popoutProps?: PopoutPropsType;
  open?: boolean;
  onClose?: () => void;
}>;
