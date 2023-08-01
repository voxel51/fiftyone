import React, { Fragment, useCallback, useRef } from "react";
import styled from "styled-components";

import * as fos from "@fiftyone/state";

import CloseIcon from "@mui/icons-material/Close";
import { Box, Typography } from "@mui/material";

import { Button, ExternalLink, InfoIcon, useTheme } from "@fiftyone/components";
import { TabOption } from "../utils";

import { SchemaSearch } from "./SchemaSearch";
import { SchemaSelection } from "./SchemaSelection";
import { useOutsideClick } from "@fiftyone/state";

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

const FIELD_VISIBILITY_DOCUMENTATION_LINK =
  "https://docs.voxel51.com/user_guide/app.html#app-field-visibility";

const SchemaSettings = () => {
  const theme = useTheme();

  const schemaModalWrapperRef = useRef<HTMLDivElement>(null);
  const schemaModalRef = useRef<HTMLDivElement>(null);

  const {
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    setSelectedTab,
    selectedTab,
    datasetName,
    excludedPaths,
    resetExcludedPaths,
    setSelectedPaths,
    setLastAppliedPaths,
    lastAppliedPaths,
    setExcludedPaths,
    isFilterRuleActive,
    enabledSelectedPaths,
    setShowNestedFields,
    mergedSchema,
  } = fos.useSchemaSettings();
  const { searchResults } = fos.useSearchSchemaFields(mergedSchema);

  const applyDisabled =
    isFilterRuleActive && (!searchTerm || !searchResults.length);
  const resetDisabled = isFilterRuleActive && !searchResults.length;

  const { setSearchResults, searchMetaFilter } =
    fos.useSearchSchemaFields(mergedSchema);

  const { setViewToFields: setSelectedFieldsStage } =
    fos.useSetSelectedFieldsStage();

  const { resetAttributeFilters } = fos.useSchemaSettings();

  useOutsideClick(schemaModalRef, (_) => {
    close();
  });

  const keyboardHandler = useCallback(
    (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active?.tagName === "INPUT") {
        if ((active as HTMLInputElement).type === "text") {
          return;
        }
      }
      if (e.key === "Escape") {
        setSettingsModal({ open: false });
      }
    },
    [setSettingsModal]
  );
  fos.useEventHandler(document, "keydown", keyboardHandler);

  const { open: isSettingsModalOpen } = settingModal || {};
  if (!isSettingsModalOpen) {
    return null;
  }

  const close = () => {
    setSearchTerm("");
    setSearchResults([]);
    setSettingsModal({ open: false });
    setSelectedPaths({ [datasetName]: new Set(lastAppliedPaths.selected) });
    setExcludedPaths({ [datasetName]: new Set(lastAppliedPaths.excluded) });
  };

  return (
    <Fragment>
      <ModalWrapper
        ref={schemaModalWrapperRef}
        onClick={(event) => event.target === schemaModalWrapperRef.current}
      >
        <Container
          ref={schemaModalRef}
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
              alignItems: "center",
            }}
          >
            <Typography
              component="h1"
              color={theme.text.primary}
              fontSize="1.5rem"
              style={{
                width: "100%",
                letterSpacing: "0.05rem",
              }}
            >
              Field visibility
            </Typography>
            <ExternalLink
              style={{
                color: theme.text.secondary,
                display: "flex",
                alignItems: "center",
                marginRight: "0.5rem",
              }}
              title="Documentation"
              href={FIELD_VISIBILITY_DOCUMENTATION_LINK}
            >
              <InfoIcon />
            </ExternalLink>
            <CloseIcon
              sx={{
                color: theme.text.primary,
                cursor: "pointer",
              }}
              onClick={() => close()}
            />
          </Box>
          <Box
            sx={{
              position: "relative !important",
              overflow: "hidden",
              width: "100%",
              paddingTop: "0.5rem",
              letterSpacing: "0.05rem",
            }}
          >
            <TabOption
              active={selectedTab}
              options={fos.TAB_OPTIONS.map((value) => {
                return {
                  key: value,
                  text: value,
                  title: `Fiele ${value}`,
                  onClick: () => {
                    setSelectedTab(value);
                    setShowNestedFields(false);
                    setSelectedPaths({
                      [datasetName]: new Set(lastAppliedPaths.selected),
                    });
                    setExcludedPaths({
                      [datasetName]: new Set(lastAppliedPaths.excluded),
                    });
                  },
                };
              })}
            />
          </Box>
          {isFilterRuleActive && (
            <SchemaSearch
              setSearchTerm={setSearchTerm}
              searchTerm={searchTerm}
            />
          )}
          {!isFilterRuleActive && <SchemaSelection />}
          <Box
            style={{
              position: "sticky",
              display: "flex",
              padding: "1rem 0",
              bottom: "-20px",
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
              disabled={applyDisabled}
              onClick={() => {
                resetAttributeFilters();
                const initialFieldNames = [...excludedPaths[datasetName]];
                let stage;
                if (isFilterRuleActive) {
                  stage = {
                    _cls: "fiftyone.core.stages.SelectFields",
                    kwargs: {
                      meta_filter: searchMetaFilter,
                      _allow_missing: true,
                    },
                  };
                } else {
                  stage = {
                    _cls: "fiftyone.core.stages.ExcludeFields",
                    kwargs: {
                      field_names: initialFieldNames,
                      _allow_missing: true,
                    },
                  };
                }

                try {
                  setSelectedFieldsStage(stage);
                } catch (e) {
                  console.error("error setting field visibility", e);
                } finally {
                  setSettingsModal({ open: false });
                }
                setLastAppliedPaths({
                  selected: enabledSelectedPaths[datasetName],
                  excluded: excludedPaths[datasetName],
                });
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
              disabled={resetDisabled}
              onClick={() => {
                setSettingsModal({ open: false });
                setSearchTerm("");
                setSelectedFieldsStage(null);
                resetExcludedPaths();
                setSearchResults([]);
                resetAttributeFilters();
              }}
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
