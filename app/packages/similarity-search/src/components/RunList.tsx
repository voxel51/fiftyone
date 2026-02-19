import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import React from "react";
import { SimilarityRun } from "../types";
import StatusBadge from "./StatusBadge";

type RunListProps = {
  runs: SimilarityRun[];
  appliedRunId?: string;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onDelete: (runId: string) => void;
  onRefresh: () => void;
  onNewSearch: () => void;
};

function formatQuery(run: SimilarityRun): string {
  if (run.query_type === "text" && typeof run.query === "string") {
    return run.query.length > 50
      ? run.query.substring(0, 50) + "..."
      : run.query;
  }
  if (run.query_type === "image") {
    const count = Array.isArray(run.query) ? run.query.length : 0;
    return `Image similarity (${count} ${count === 1 ? "sample" : "samples"})`;
  }
  return run.query_type;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

export default function RunList({
  runs,
  appliedRunId,
  onApply,
  onClone,
  onDelete,
  onRefresh,
  onNewSearch,
}: RunListProps) {
  return (
    <Box sx={{ p: 2, height: "100%" }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h6">Similarity Search</Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={onRefresh}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onNewSearch}
          >
            New Search
          </Button>
        </Stack>
      </Stack>

      {runs.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "50%",
            gap: 2,
          }}
        >
          <Typography color="text.secondary">
            No similarity searches yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create a new search to find similar samples using your computed
            embeddings.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={onNewSearch}
          >
            New Search
          </Button>
        </Box>
      ) : (
        <List sx={{ overflow: "auto" }}>
          {runs.map((run) => (
            <ListItem
              key={run.run_id}
              sx={{
                border: 1,
                borderColor:
                  appliedRunId === run.run_id ? "primary.main" : "divider",
                borderRadius: 1,
                mb: 1,
                bgcolor:
                  appliedRunId === run.run_id
                    ? "action.selected"
                    : "background.paper",
              }}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Apply results">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => onApply(run.run_id)}
                        disabled={run.status !== "completed"}
                        color="primary"
                      >
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Clone search">
                    <IconButton
                      size="small"
                      onClick={() => onClone(run.run_id)}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={() => onDelete(run.run_id)}
                      color="error"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" fontWeight="bold">
                      {run.run_name}
                    </Typography>
                    <StatusBadge status={run.status} />
                    {run.status === "completed" && (
                      <Typography variant="caption" color="text.secondary">
                        {run.result_count} results
                      </Typography>
                    )}
                  </Stack>
                }
                secondary={
                  <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatQuery(run)} {"\u00B7"} {run.brain_key}
                      {run.k ? ` \u00B7 k=${run.k}` : ""}
                      {run.reverse ? " (least similar)" : ""}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {formatTime(run.creation_time)}
                    </Typography>
                    {run.status === "failed" && run.status_details && (
                      <Typography variant="caption" color="error.main">
                        {run.status_details}
                      </Typography>
                    )}
                  </Stack>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
