import React, { Fragment, useRef } from "react";
import styled from "styled-components";

import CloseIcon from "@mui/icons-material/Close";
import { Box, Typography } from "@mui/material";

import { Button, useTheme } from "@fiftyone/components";
import { TabOption } from "../utils";

import useSchemaSettings, {
  TAB_OPTIONS,
  TAB_OPTIONS_MAP,
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
  width: 750px;
  height: 80vh;
  overflow-y: auto;
  min-height: auto;
  background: white;
`;

interface Props {}

const SchemaSettings = () => {
  const theme = useTheme();

  const schemaModalWrapperRef = useRef<HTMLDivElement>(null);

  const {
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    setSelectedTab,
    originalSelectedPaths,
    setSelectedPaths,
    selectedTab,
    finalSelectedPaths,
    setSearchResults,
    setFieldsOnly,
    setSelectedFieldsStage,
  } = useSchemaSettings();

  const { open: isSettingsModalOpen } = settingModal || {};
  if (!isSettingsModalOpen) {
    return null;
  }

  const closeModal = (params: { resetStage: boolean }) => {
    const { resetStage } = params;
    setSettingsModal({ ...settingModal, open: false });
    setSearchTerm("");
    setSelectedPaths(originalSelectedPaths);
    if (resetStage) {
      setSelectedFieldsStage(null);
    }
  };

  return (
    <Fragment>
      <ModalWrapper
        ref={schemaModalWrapperRef}
        onClick={(event) => {
          const clickedOutsideModal =
            event.target === schemaModalWrapperRef.current;
          if (clickedOutsideModal) {
            closeModal({ resetStage: false });
          }
          return clickedOutsideModal;
        }}
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
            <Typography
              component="h1"
              color={theme.text.primary}
              fontSize="1.5rem"
              style={{
                width: "100%",
              }}
            >
              Field visibility
            </Typography>
            <CloseIcon
              sx={{
                color: theme.text.primary,
                cursor: "pointer",
              }}
              onClick={() => closeModal({ resetStage: false })}
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
                  onClick: () => {
                    setSelectedTab(value);
                    if (value === TAB_OPTIONS_MAP.SELECTION) {
                      setSearchTerm("");
                      setSearchResults([]);
                    }
                    if (value === TAB_OPTIONS_MAP.FILTER_RULE) {
                      setFieldsOnly(false);
                    }
                  },
                };
              })}
            />
          </Box>
          {selectedTab === TAB_OPTIONS_MAP.FILTER_RULE && (
            <SchemaSearch
              setSearchTerm={setSearchTerm}
              searchTerm={searchTerm}
            />
          )}
          {selectedTab === TAB_OPTIONS_MAP.SELECTION && <SchemaSelection />}
          <Box
            style={{
              position: "absolute",
              display: "flex",
              padding: "1rem 1.5rem",
              bottom: 0,
              background: theme.background.level2,
              left: 0,
            }}
          >
            <Button
              style={{
                color: theme.text.primary,
                marginRight: "0.5rem",
                boxShadow: "none",
                padding: "0.25rem 0.5rem",
                borderRadius: "4px",
              }}
              onClick={() => {
                const stageKwargs = {
                  field_names: [...finalSelectedPaths],
                  _allow_missing: true,
                };
                const stageCls = "fiftyone.core.stages.SelectFields";
                const stage = {
                  _cls: stageCls,
                  kwargs: stageKwargs,
                } as Stage;
                try {
                  setSelectedFieldsStage(stage);
                } catch (e) {
                  console.log("error setting selected field stages", e);
                } finally {
                  setSettingsModal({ open: false });
                }
              }}
            >
              Apply
            </Button>
            <Button
              style={{
                color: theme.text.primary,
                boxShadow: "none",
                padding: "0.25rem 0.5rem",
                borderRadius: "4px",
              }}
              onClick={() => closeModal({ resetStage: true })}
            >
              Reset
            </Button>
          </Box>
        </Container>
      </ModalWrapper>
    </Fragment>
  );
};

export default SchemaSettings;
