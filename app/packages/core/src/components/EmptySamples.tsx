import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import * as fos from "@fiftyone/state";
import { SamplesHeader } from "./ImageContainerHeader";
import { Typography } from "@mui/material";
import ClearAll from "@mui/icons-material/ClearAll";
import { Button, useTheme } from "@fiftyone/components";
import ErrorImg from "../images/error.svg";
import { ExternalLink } from "../utils/generic";

const BaseContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const Container = styled(SamplesHeader)`
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-width: 300px;
`;

const TextContainer = styled(Container)`
  height: 100%;
  width: 100%;
  position: relative;
  justify-content: end;
`;

const ActionContainer = styled(TextContainer)`
  justify-content: start;
  display: flex;
  position: relative;
`;

export default function EmptySamples() {
  const loadedView = useRecoilValue<fos.State.Stage[]>(fos.view);
  const totalSamples = useRecoilValue(
    fos.count({ path: "", extended: true, modal: false })
  );

  const theme = useTheme();
  const setView = fos.useSetView();

  const showEmptyDataset = useMemo(
    () => !loadedView?.length && !totalSamples,
    [totalSamples, loadedView]
  );

  const showEmptyView = useMemo(
    () => loadedView?.length && !totalSamples,
    [totalSamples, loadedView]
  );

  if (!showEmptyView && !showEmptyDataset) {
    return null;
  }

  return (
    <Container style={{ padding: "6rem 1rem" }}>
      <BaseContainer style={{ flexDirection: "column" }}>
        <TextContainer>
          <Typography variant="h6" component="span">
            {!!showEmptyView && "Your view is empty"}
            {!!showEmptyDataset && "Your dataset is empty"}
          </Typography>
        </TextContainer>
      </BaseContainer>
      {!!showEmptyDataset && (
        <BaseContainer style={{ padding: "1rem 0 2rem 0" }}>
          <ExternalLink
            href="https://docs.voxel51.com/user_guide/dataset_creation/index.html"
            style={{ display: "flex", color: theme.text.secondary }}
          >
            <Typography
              variant="subtitle1"
              component="span"
              sx={{ color: theme.text.secondary }}
            >
              Add samples to your dataset
            </Typography>
          </ExternalLink>
        </BaseContainer>
      )}
      {!!showEmptyView && (
        <BaseContainer style={{ paddingBottom: "1rem" }}>
          <ActionContainer>
            <Button aria-label="clear-filters" onClick={() => setView([], [])}>
              <BaseContainer style={{ padding: "0.25rem" }}>
                <BaseContainer>
                  <Typography variant="body1" component="span">
                    Clear view
                  </Typography>
                </BaseContainer>
                <ClearAll sx={{ ml: ".5rem" }} />
              </BaseContainer>
            </Button>
          </ActionContainer>
        </BaseContainer>
      )}
      <BaseContainer>
        <img src={ErrorImg} height={402} width={296} />
      </BaseContainer>
    </Container>
  );
}

// export default React.memo(EmptySamples);
