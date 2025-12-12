import { Box, Typography } from "@mui/material";
import styled from "styled-components";

// ============================================
// Shared Layout Components
// ============================================

export const Section = styled.div`
  margin-bottom: 1.5rem;
`;

export const ListContainer = styled.div`
  padding: 1rem;
`;

export const EmptyStateBox = styled(Box)`
  background: ${({ theme }) => theme.background.level1};
  border-radius: 4px;
  padding: 2rem;
  display: flex;
  justify-content: center;
  align-items: center;
`;

// ============================================
// Edit Schema Page Components
// ============================================

export const EditContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-bottom: 64px;
`;

export const EditSectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
`;

export const FieldRow = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
`;

export const FieldColumn = styled.div`
  flex: 1;
`;

export const Label = styled(Typography)`
  margin-bottom: 0.5rem !important;
  color: ${({ theme }) => theme.text.secondary};
`;

export const SchemaSection = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const TabsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

export const ContentArea = styled.div`
  flex: 1;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.divider};
  border-radius: 4px;
`;

export const ItemRow = styled.div`
  display: flex;
  align-items: center;
  background: ${({ theme }) => theme.background.level1};
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  gap: 0.75rem;
`;

export const ItemContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const ItemActions = styled.div`
  display: flex;
  gap: 0.25rem;
`;

// Tab styles for Schema Manager (no borders)
export const tabsStyles = {
  minHeight: 36,
  "& .MuiTabs-flexContainer": {
    height: 36,
  },
  "& .MuiTab-root": {
    minHeight: 36,
    height: 36,
    padding: "7px 16px",
    minWidth: "unset",
    textTransform: "none",
    color: "text.secondary",
    "&.Mui-selected": {
      color: "text.primary",
      backgroundColor: "background.level1",
    },
  },
};

// Tab styles for Edit Field Schema (with borders)
export const editTabsStyles = {
  minHeight: 36,
  "& .MuiTabs-flexContainer": {
    height: 36,
  },
  "& .MuiTab-root": {
    minHeight: 36,
    height: 36,
    padding: "7px 16px",
    minWidth: "unset",
    textTransform: "none",
    color: "text.secondary",
    border: "1px solid",
    borderColor: "divider",
    borderRight: "none",
    "&:first-of-type": {
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
    },
    "&:last-of-type": {
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      borderRight: "1px solid",
      borderRightColor: "divider",
    },
    "&.Mui-selected": {
      color: "text.primary",
      backgroundColor: "background.level1",
    },
  },
};

// ============================================
// GUI View Components
// ============================================

export const GUISectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
`;

export const CollapsibleHeader = styled(GUISectionHeader)`
  cursor: pointer;
  user-select: none;

  &:hover {
    opacity: 0.8;
  }
`;

export const FooterContainer = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem 2rem;
  background: ${({ theme }) => theme.background.level2};
  border-top: 1px solid ${({ theme }) => theme.primary.plainBorder};
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 0.5rem;
`;
