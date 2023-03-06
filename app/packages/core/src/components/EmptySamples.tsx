import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import * as fos from "@fiftyone/state";
import { SamplesHeader } from "./ImageContainerHeader";
import { Typography } from "@mui/material";
import ClearAll from "@mui/icons-material/ClearAll";
import { Button } from "@fiftyone/components";

const BaseContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
`;

const Container = styled(SamplesHeader)`
  height: 30vh;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
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

function EmptySamples() {
  const loadedView = useRecoilValue<fos.State.Stage[]>(fos.view);
  const totalSamples = useRecoilValue(
    fos.count({ path: "", extended: false, modal: false })
  );
  const setView = fos.useSetView();

  const showEmptySamples = useMemo(
    () => loadedView?.length && !totalSamples,
    [totalSamples, loadedView]
  );

  if (!showEmptySamples) return null;
  return (
    <Container>
      <TextContainer>
        <Typography variant="h6" component="span">
          Your view is empty :-|
        </Typography>
      </TextContainer>
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
    </Container>
  );
}

export default React.memo(EmptySamples);
