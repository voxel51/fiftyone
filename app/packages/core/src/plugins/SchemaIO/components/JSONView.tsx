import { Copy as CopyIcon } from "@fiftyone/components";
import { scrollbarStyles } from "@fiftyone/utilities";
import { Box, SvgIconProps, useColorScheme } from "@mui/material";
import React from "react";
import ReactJSON from "searchable-react-json-view";
import styled from "styled-components";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";

export default function JSONView(props) {
  const { data, schema } = props;
  const { mode } = useColorScheme();
  const isDarkMode = mode === "dark";

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <ReactJSONContainer {...getComponentProps(props, "jsonContainer")}>
        <ReactJSON
          src={data ?? schema?.default}
          theme={`ashes${!isDarkMode ? ":inverted" : ""}`}
          style={{
            padding: "1rem",
            maxHeight: "50vh",
            overflow: "auto",
          }}
          iconStyle="square"
          indentWidth={2}
          customCopyIcon={<CopyIcon sx={copyIconStyles} />}
          customCopiedIcon={
            <CopyIcon
              sx={{
                ...copyIconStyles,
                color: (theme) => theme.palette.primary.plainColor,
              }}
            />
          }
          {...getComponentProps(props, "json")}
        />
      </ReactJSONContainer>
    </Box>
  );
}

const ReactJSONContainer = styled.div`
  .react-json-view {
    ${scrollbarStyles}
  }
`;

const copyIconStyles: SvgIconProps["sx"] = {
  color: (theme) => theme.palette.text.tertiary,
  fontSize: "1.25rem",
  position: "absolute",
};
