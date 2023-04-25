import React, { Fragment, useRef } from "react";
import styled from "styled-components";

import { Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Checkbox from "@mui/material/Checkbox";
import { Button, useTheme } from "@fiftyone/components";
import { TabOption } from "../utils";

import useSchemaSettings, {
  TAB_OPTIONS,
  TAG_OPTIONS_MAP,
} from "@fiftyone/state/src/hooks/useSchemaSettings";

import { SchemaSearch } from "./SchemaSearch";

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
  const { test } = props;
  const theme = useTheme();

  const schemaModalRef = useRef<HTMLDivElement>(null);

  const {
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    finalSelectedPaths,
    setSelectedTab,
    originalSelectedPaths,
    setSelectedPaths,
    selectedTab,
    fieldsOnly,
    setFieldsOnly,
    setView,
    toggleSelection,
    finalSchema,
    allFieldsChecked,
    setAllFieldsChecked,
  } = useSchemaSettings();

  const { open: isSettingsModalOpen } = settingModal || {};

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
          {selectedTab === TAG_OPTIONS_MAP.SELECTION && (
            <Box
              display="flex"
              flexDirection="column"
              sx={{ position: "relative !important" }}
            >
              <Box
                style={{
                  position: "relative",
                  padding: "0.5rem 0",
                  color: theme.text.primary,
                  display: "flex",
                }}
              >
                Show attributes
                <Checkbox
                  name={"Carousel"}
                  value={!fieldsOnly}
                  checked={!fieldsOnly}
                  onChange={() => setFieldsOnly(!fieldsOnly)}
                  style={{ padding: "4px" }}
                />
              </Box>
              {!allFieldsChecked && (
                <Box
                  style={{
                    position: "relative",
                    color: theme.text.primary,
                    display: "flex",
                  }}
                >
                  Select All
                  <Checkbox
                    name={"Carousel"}
                    value={allFieldsChecked}
                    checked={allFieldsChecked}
                    onChange={() => setAllFieldsChecked(!allFieldsChecked)}
                    style={{ padding: "4px" }}
                  />
                </Box>
              )}
              {allFieldsChecked && (
                <Box
                  style={{
                    position: "relative",
                    color: theme.text.primary,
                    display: "flex",
                  }}
                >
                  Deselect All
                  <Checkbox
                    name={"Carousel"}
                    value={allFieldsChecked}
                    checked={allFieldsChecked}
                    onChange={() => setAllFieldsChecked(!allFieldsChecked)}
                    style={{ padding: "4px" }}
                  />
                </Box>
              )}
              <Box
                style={{
                  position: "relative",
                  height: "50vh",
                  marginTop: "1rem",
                  overflow: "auto",
                  color: "#232323",
                  border: `1px solid ${theme.primary.plainBorder}`,
                }}
              >
                {finalSchema.map((item) => {
                  const {
                    path,
                    count,
                    isSelected,
                    pathLabelFinal,
                    skip,
                    disabled,
                  } = item;

                  if (skip) return null;

                  return (
                    <Box
                      style={{
                        padding: "0.25rem 0.25rem",
                        borderBottom: `1px solid ${theme.primary.plainBorder}`,
                        display: "flex",
                      }}
                      key={path}
                    >
                      <Box>
                        <Checkbox
                          name={"Carousel"}
                          value={path}
                          checked={isSelected}
                          onChange={() => {
                            toggleSelection(path, isSelected);
                          }}
                          style={{
                            padding: 0,
                          }}
                          disabled={disabled}
                        />
                      </Box>
                      <Box
                        style={{
                          paddingLeft: `${(count - 1) * 15 + 5}px`,
                          color: disabled
                            ? theme.text.tertiary
                            : theme.text.primary,
                        }}
                      >
                        {pathLabelFinal}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
              <Box
                style={{
                  position: "relative",
                  display: "flex",
                  padding: "1rem 0.25rem",
                }}
              >
                <Button
                  style={{
                    color: theme.text.primary,
                    marginRight: "0.5rem",
                    boxShadow: "none",
                    padding: "0.5rem 0.5rem",
                    borderRadius: "4px",
                  }}
                  onClick={() => {
                    const stageKwargs = [
                      ["field_names", [...finalSelectedPaths]],
                      ["_allow_missing", true],
                    ];
                    const stageCls = "fiftyone.core.stages.SelectFields";
                    const stage = {
                      _cls: stageCls,
                      kwargs: stageKwargs,
                    } as Stage;
                    try {
                      setView([stage]);
                    } catch (e) {
                      console.log("error", e);
                    } finally {
                      setSettingsModal({ open: false });
                    }
                  }}
                >
                  Add to view
                </Button>
                <Button
                  style={{
                    color: theme.text.primary,
                    boxShadow: "none",
                    padding: "0.5rem 0.5rem",
                    borderRadius: "4px",
                  }}
                  onClick={() => {
                    setSettingsModal({ open: false });
                    setSearchTerm("");
                    setSelectedPaths(originalSelectedPaths);
                  }}
                >
                  cancel
                </Button>
              </Box>
            </Box>
          )}
        </Container>
      </ModalWrapper>
    </Fragment>
  );
};

export default SchemaSettings;
