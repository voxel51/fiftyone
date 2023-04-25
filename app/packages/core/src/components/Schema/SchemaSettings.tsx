import React, { Fragment, useRef } from "react";
import styled from "styled-components";

import { Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import { useTheme } from "@fiftyone/components";
import { TabOption } from "../utils";

import useSchemaSettings, {
  TAB_OPTIONS,
  TAG_OPTIONS_MAP,
} from "@fiftyone/state/src/hooks/useSchemaSettings";

import { SchemaSearch } from "./SchemaSearch";
import { SchemaSelection } from "./SchemaSelection";

const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000000;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: ${({ theme }) => theme.neutral.softBg};
`;

const Container = styled.div`
  position: relative;

  & > div {
    position: absolute;
    transform-origin: 50% 50% 0px;
    touch-action: none;
    width: 100%;
  }

  margin: 1rem;
  min-width: 60vw;
  max-width: 60vw;
  height: 80vh;
  overflow-y: auto;
  min-height: auto;
  background: white;
`;

interface Props {
  test?: boolean;
}

const SchemaSettings = (props: Props) => {
  const theme = useTheme();

  const schemaModalRef = useRef<HTMLDivElement>(null);

  const {
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    setSelectedTab,
    originalSelectedPaths,
    setSelectedPaths,
    selectedTab,
  } = useSchemaSettings();

  const { open: isSettingsModalOpen } = settingModal || {};
  console.log("isSettingsModalOpen", isSettingsModalOpen);

  if (!isSettingsModalOpen) {
    return null;
  }

  return (
    <Fragment>
      <ModalWrapper
        ref={schemaModalRef}
        onClick={(event) =>
          event.target === schemaModalRef.current && console.log("TODO")
        }
      >
        <Container
          style={{
            ...screen,
            zIndex: 10001,
            padding: "1.5rem",
            backgroundColor: theme.background.level2,
          }}
        >
          <Box
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <h3
              color={theme.text.primary}
              style={{
                padding: 0,
                margin: 0,
                width: "100%",
              }}
            >
              Schema field visibilty
            </h3>
            <CloseIcon
              sx={{
                color: theme.text.primary,
                cursor: "pointer",
              }}
              onClick={() => {
                setSearchTerm("");
                setSelectedPaths(originalSelectedPaths);
                setSettingsModal({ ...settingModal, open: false });
              }}
            />
          </Box>
          <Box
            sx={{
              position: "relative !important",
              overflow: "hidden",
              width: "100%",
              paddingTop: "0.5rem",
            }}
          >
            <TabOption
              active={selectedTab}
              options={TAB_OPTIONS.map((value) => {
                return {
                  key: value,
                  text: value,
                  title: `Fiele ${value}`,
                  onClick: () => setSelectedTab(value),
                };
              })}
            />
          </Box>
          {selectedTab === TAG_OPTIONS_MAP.SEARCH && (
            <SchemaSearch
              setSearchTerm={setSearchTerm}
              searchTerm={searchTerm}
            />
          )}
          {selectedTab === TAG_OPTIONS_MAP.SELECTION && <SchemaSelection />}
        </Container>
      </ModalWrapper>
    </Fragment>
  );
};

export default SchemaSettings;
