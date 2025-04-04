import { styled } from "@mui/material";
import { Table } from "@mui/material";

export const EvaluationTable = styled(Table)(({ theme }) => ({
  ".MuiTableCell-root": {
    border: `1px solid ${theme.palette.divider}`,
  },
}));
EvaluationTable.defaultProps = {
  size: "small",
};

export const tabStyles = {
  container: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    mb: 2,
  },
  tabs: {
    minHeight: 36,
    width: "100%",
    "& .MuiTabs-flexContainer": {
      height: 36,
      width: "100%",
      display: "flex",
      "& > *": {
        flex: 1,
      },
    },
    "& .MuiTab-root": {
      minHeight: 36,
      height: 36,
      padding: "7px 16px",
      minWidth: "unset",
      fontSize: 13,
      fontWeight: 500,
      lineHeight: "20px",
      fontFamily: "Palanquin",
      textTransform: "none",
      color: "#999999",
      border: "1px solid #333333",
      borderRight: "none",
      "&:first-of-type": {
        borderTopLeftRadius: 4,
        borderBottomLeftRadius: 4,
      },
      "&:last-of-type": {
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
        borderRight: "1px solid #333333",
      },
      "&.Mui-selected": {
        color: "white",
        backgroundColor: "#333333",
      },
    },
  },
};

export const scenarioCardStyles = {
  card: {
    p: 2,
    height: "100%",
    background: "#262626",
    borderRadius: "4px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: "Palanquin",
    fontWeight: 600,
    lineHeight: "20px",
    color: "white",
  },
  newBadge: {
    fontSize: 12,
    fontFamily: "Palanquin",
    fontWeight: 700,
    lineHeight: "20px",
    color: "#FFC59B",
  },
  emptyState: {
    height: 433,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  iconContainer: {
    width: 28,
    height: 28,
    position: "relative",
    overflow: "hidden",
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: "Palanquin",
    fontWeight: 600,
    lineHeight: "20px",
    color: "white",
  },
  emptyStateDescription: {
    width: 421,
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Palanquin",
    fontWeight: 400,
    lineHeight: "19px",
    color: "#CCCCCC",
  },
  createButton: {
    px: 2,
    py: "6px",
    background: "#FF6D04",
    borderRadius: "4px",
    fontSize: 13,
    fontFamily: "Palanquin",
    fontWeight: 500,
    lineHeight: "20px",
    color: "white",
    textTransform: "none",
    "&:hover": {
      background: "#FF6D04",
    },
  },
};
