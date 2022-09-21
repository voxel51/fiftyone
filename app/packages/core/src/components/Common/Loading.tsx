import React from "react";
import styled from "styled-components";
import { CircularProgress } from "@material-ui/core";
import { useTheme } from "@fiftyone/components";

const IconDiv = styled.div`
  position: absolute;
  top: 50%;
  right: 50%;

  & > svg {
    color: ${({ theme }) => theme.font};
  }
`;

const Loading = React.memo(
  ({ loading = true, size = 32 }: { loading?: boolean; size?: number }) => {
    const theme = useTheme();
    return (
      <IconDiv style={{ marginTop: -size / 2, marginLeft: size / 2 }}>
        {loading && (
          <CircularProgress
            style={{
              color: theme.font,
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
