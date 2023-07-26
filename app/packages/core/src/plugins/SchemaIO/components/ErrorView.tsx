import { Box, Stack, Typography } from "@mui/material";
import React, { useState } from "react";
import PopoutButton from "./PopoutButton";
import { Error } from "@mui/icons-material";
import { getComponentProps } from "../utils";

export default function ErrorView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const { detailed, popout, left } = view;
  const errors = [
    ...(Array.isArray(data) ? data : []),
    ...(Array.isArray(schema?.default) ? schema?.default : []),
  ];

  if (errors.length === 0) return null;

  if (detailed) {
    return (
      <DetailedErrors popout={popout} left={left} {...props} errors={errors} />
    );
  }

  return (
    <Typography
      variant="body2"
      color="error.main"
      {...getComponentProps(props, "container")}
    >
      {errors.map(({ reason }) => reason).join(", ")}
    </Typography>
  );
}

function DetailedErrors(props) {
  const { errors, popout, left } = props;

  const Wrapper = popout ? PopoutButton : Box;
  const wrapperProps = popout
    ? {
        Button: (
          <Stack direction="row" sx={{ alignItems: "center" }} spacing={0.5}>
            <Error color="error" />
            {popout && (
              <Typography color="error">{errors.length} errors</Typography>
            )}
          </Stack>
        ),
        popoutStyles: left ? { left: "unset", right: 0 } : {},
      }
    : {};

  return (
    <Wrapper {...wrapperProps} {...getComponentProps(props, "container")}>
      {errors.map((error) => (
        <DetailedError {...error} />
      ))}
    </Wrapper>
  );
}

function DetailedError(props) {
  const [show, setShow] = useState(false);
  const { reason, details } = props;

  const canExpand = Boolean(details);

  return (
    <Box
      sx={{
        color: "#fc4545",
        background: "hsla(0,100%,50%,0.12)",
        borderTop: "1px solid hsla(0,100%,50%,0.25)",
        "&:last-child": {
          borderBottom: "1px solid hsla(0,100%,50%,0.25)",
        },
      }}
    >
      <Typography sx={{ cursor: "default" }} onClick={() => setShow(!show)}>
        {canExpand && (
          <Typography
            fontSize={8}
            component="span"
            sx={{ pl: 0.5, pr: 0.25, verticalAlign: "middle", fontSize: 8 }}
          >
            {show ? "▼" : "►"}
          </Typography>
        )}
        {reason}
      </Typography>
      {show && (
        <Typography component="pre" sx={{ pl: 1.75 }}>
          {details}
        </Typography>
      )}
    </Box>
  );
}
