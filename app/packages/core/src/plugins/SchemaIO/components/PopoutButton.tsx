import { IconButton, Popout } from "@fiftyone/components";
import { useOutsideClick } from "@fiftyone/state";
import { Box, Typography } from "@mui/material";
import React, { useRef, useState } from "react";

// todo: convert to a view
export default function PopoutButton(props: PopoutButtonProps) {
  const { children, Button, popoutStyles = {} } = props;
  const [open, setOpen] = useState(false);
  const popoutRef = useRef(null);

  useOutsideClick(popoutRef, () => {
    setOpen(false);
  });

  return (
    <Box sx={{ position: "relative", display: "inline" }} ref={popoutRef}>
      <IconButton onClick={() => setOpen(!open)} sx={{ m: 0, px: 0 }}>
        {Button}
      </IconButton>
      {open && (
        <Popout style={{ top: "80%", left: 0, padding: 4, ...popoutStyles }}>
          {children}
        </Popout>
      )}
    </Box>
  );
}

type PopoutButtonProps = {
  children: JSX.Element;
  Button: JSX.Element;
  popoutStyles?: object;
};
