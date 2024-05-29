import { JSONViewer } from "@fiftyone/components";
import { scrollbarStyles } from "@fiftyone/utilities";
import { Stack } from "@mui/material";
import React from "react";
import styled from "styled-components";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";

export default function JSONView(props) {
  const { data, schema } = props;
  const rawValue = data ?? schema?.default;
  const value = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;

  return (
    <Stack spacing={0.5} {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <ReactJSONContainer {...getComponentProps(props, "jsonContainer")}>
        <JSONViewer
          value={value}
          jsonViewerProps={{
            style: {
              padding: "1rem",
              maxHeight: "50vh",
              overflow: "auto",
            },
          }}
          {...getComponentProps(props, "jsonViewer")}
        />
      </ReactJSONContainer>
    </Stack>
  );
}

const ReactJSONContainer = styled.div`
  padding: 1rem;
  background: var(--fo-palette-background-level3);
  border-radius: 4px;
  .react-json-view {
    ${scrollbarStyles}
  }
`;
