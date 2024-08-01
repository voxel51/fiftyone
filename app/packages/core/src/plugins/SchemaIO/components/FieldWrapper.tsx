import { Box, Typography } from "@mui/material";
import React from "react";
import ErrorView from "./ErrorView";
import HeaderView from "./HeaderView";
import { getComponentProps, getErrorsForView } from "../utils";
import { ViewPropsType } from "../utils/types";

export default function FieldWrapper(props: FieldWrapperProps) {
  const { schema, children, hideHeader } = props;
  const { view = {} } = schema;

  return (
    <Box {...getComponentProps(props, "container")}>
      {!hideHeader && (
        <HeaderView {...props} sx={{ pb: 1 }} omitCaption omitErrors nested />
      )}
      {children}
      {view.caption && (
        <Typography
          variant="body2"
          color="text.tertiary"
          sx={{ pt: 0.5 }}
          {...getComponentProps(props, "caption")}
        >
          {view.caption}
        </Typography>
      )}
      <ErrorView schema={{}} data={getErrorsForView(props)} />
    </Box>
  );
}

type FieldWrapperProps = ViewPropsType & {
  children: React.ReactNode;
  hideHeader?: boolean;
};
