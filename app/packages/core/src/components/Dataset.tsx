import { activeColorField, modal } from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import * as fos from "@fiftyone/state";

import ColorModal from "./ColorModal/ColorModal";
import Modal from "./Modal";
import SamplesContainer from "./SamplesContainer";

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const Body = styled.div`
  width: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`;

function Dataset() {
  const isModalActive = Boolean(useRecoilValue(modal));
  const isCustomizeColorModalActive = useRecoilValue(activeColorField);
  const isUsingSessionColorScheme = useRecoilValue(
    fos.isUsingSessionColorScheme
  );
  const datasetColorScheme = useRecoilValue(fos.datasetAppConfig)?.colorScheme;
  const setSessionColor = useSetRecoilState(fos.sessionColorScheme);

  useEffect(() => {
    if (!isUsingSessionColorScheme && datasetColorScheme) {
      console.info("dataset.appConfig", datasetColorScheme);
      const colorPool =
        datasetColorScheme.colorPool?.length > 0
          ? datasetColorScheme.colorPool
          : fos.DEFAULT_APP_COLOR_SCHEME.colorPool;
      const customizedColorSettings =
        JSON.parse(datasetColorScheme.customizedColorSettings) ??
        fos.DEFAULT_APP_COLOR_SCHEME.customizedColorSettings;
      console.info(colorPool, customizedColorSettings);
      setSessionColor({
        colorPool,
        customizedColorSettings,
      });
    }
  }, [isUsingSessionColorScheme, datasetColorScheme]);

  return (
    <>
      {isModalActive && <Modal />}
      {isCustomizeColorModalActive && <ColorModal />}
      <Container>
        <Body key={"body"}>
          <SamplesContainer key={"samples"} />
        </Body>
      </Container>
    </>
  );
}

export default React.memo(Dataset);
