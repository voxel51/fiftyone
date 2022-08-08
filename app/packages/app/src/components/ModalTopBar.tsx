import * as fos from "@fiftyone/state";
import { modalTopBarVisible } from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

const Header = styled.div`
  position: absolute;
  cursor: pointer;
  top: 0;
  display: flex;
  padding: 0.5rem;
  justify-content: space-between;
  overflow: visible;
  width: 100%;
  z-index: 1000;

  background-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0),
    30%,
    ${({ theme }) => theme.backgroundDark}
  );
`;

export default () => {
  const visible = useRecoilValue(modalTopBarVisible);
  const headerRef = useRef<HTMLElement>();
  const onSelect = fos.useSelectSample();
  const selected = useRecoilValue(fos.selectedSamples);

  const isSelected = selected.has(sampleData.sample._id);

  const select = () => onSelect(sampleData.sample._id);

  {
    visible && (
      <Header
        ref={headerRef}
        onClick={() => event.target === headerRef.current && select()}
      >
        <Checkbox
          disableRipple
          title={isSelected ? "Select sample" : "Selected"}
          checked={isSelected}
          style={{ color: theme.brand }}
          onClick={select}
        />
        {!pinned && <ModalActionsRow lookerRef={lookerRef} />}
      </Header>
    );
  }
};
