import { PopoutSectionTitle } from "@fiftyone/components";
import { executeOperator } from "@fiftyone/operators";
import SettingsIcon from "@mui/icons-material/Settings";
import React, { useCallback } from "react";
import styled from "styled-components";
import { PANEL_NAME } from "./constants";

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  color: ${({ theme }) => theme.text.secondary};
  font-size: 13px;

  &:hover {
    background-color: ${({ theme }) => theme.background.level1};
    color: ${({ theme }) => theme.text.primary};
  }
`;

interface Props {
  hasSimilarityKeys: boolean;
  isImageSearch: boolean;
}

const Helper = (props: Props) => {
  const { isImageSearch } = props;

  const openPanel = useCallback(() => {
    executeOperator("open_panel", {
      name: PANEL_NAME,
      isActive: true,
      layout: "horizontal",
      data: { view: { page: "similarity_index" } },
    });
  }, []);

  return (
    <>
      <PopoutSectionTitle style={{ fontSize: 12 }}>
        {isImageSearch
          ? "No available brain keys"
          : "No brain keys support text prompts"}
      </PopoutSectionTitle>
      <ActionRow
        onClick={openPanel}
        title="Open similarity panel to manage indexes"
      >
        <SettingsIcon style={{ fontSize: 16 }} />
        Manage similarity indexes
      </ActionRow>
    </>
  );
};

export default Helper;
