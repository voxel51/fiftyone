import React from "react";
import styled from "styled-components";
import { CircularProgress } from "@mui/material";
import { useTheme } from "@fiftyone/components";

const IconDiv = styled.div`
  display: block;
  position: relative;
  height: 16px;
  width: 16px;
  margin-right: 4px;

  & > svg {
    color: ${({ theme }) => theme.text.primary};
  }
`;

const Loading = React.memo(
  ({ loading = true }: { loading?: boolean; }) => {
    const theme = useTheme();

    return (
      <IconDiv>
        {loading && (
          <CircularProgress
            style={{
              color: theme.text.primary,
              height: "100%",
              width: "100%",
              position: "absolute"
            }}
          />
        )}
      </IconDiv>
    );
  }
);

export default Loading;
