import React from "react";
import styled from "styled-components";
import { CircularProgress } from "@material-ui/core";
import { useTheme } from "@fiftyone/components";

const IconDiv = styled.div`
  display: block;
  padding: 2px;
  height: 16px;
  width: 16px;

  & > svg {
    color: ${({ theme }) => theme.text.primary};
  }
`;

const Loading = React.memo(
  ({ loading = true, size = 32 }: { loading?: boolean; size?: number }) => {
    const theme = useTheme();

    return (
      <IconDiv>
        {loading && (
          <CircularProgress
            style={{
              color: theme.text.primary,
              height: "100%",
              width: "100%",
            }}
          />
        )}
      </IconDiv>
    );
  }
);

export default Loading;
