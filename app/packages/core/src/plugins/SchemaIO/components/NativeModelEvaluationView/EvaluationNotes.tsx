import { Markdown } from "@fiftyone/components";
import { ArrowDownward } from "@mui/icons-material";
import { Box, Button, Typography, useTheme } from "@mui/material";
import React, { useCallback, useEffect, useLayoutEffect } from "react";

const DEFAULT_NOTE =
  "No evaluation notes added yet. Click the edit button to add evaluation notes.";
const MAX_NOTES_HEIGHT = 72;

export default function EvaluationNotes(props: EvaluationNotesProps) {
  const { notes, variant = "overview" } = props;
  const hasNotes = Boolean(notes);
  const showDefault = variant === "details";
  const notesRef = React.useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const theme = useTheme();

  const truncate = useCallback(() => {
    const notesElem = notesRef.current;
    if (notesElem) {
      if (notesElem.clientHeight > MAX_NOTES_HEIGHT) {
        setIsTruncated(true);
      }
    }
  }, [notesRef]);

  useLayoutEffect(() => {
    truncate();
  }, [truncate]);

  useEffect(() => {
    truncate();
  }, [notes, truncate]);

  if (!hasNotes && !showDefault) return null;

  const color = hasNotes
    ? variant === "overview"
      ? "secondary"
      : "primary"
    : "tertiary";

  return (
    <Box>
      <Box
        sx={{
          maxHeight: expanded ? "unset" : MAX_NOTES_HEIGHT,
          overflow: "hidden",
        }}
      >
        <Typography
          variant={hasNotes ? "body1" : "body2"}
          sx={{ color: (theme) => theme.palette.text[color] }}
          ref={notesRef}
        >
          <Markdown>{notes || DEFAULT_NOTE}</Markdown>
        </Typography>
      </Box>
      {isTruncated && (
        <Box
          sx={{
            background: `linear-gradient(to bottom, hsla(200, 0%, ${
              theme.palette.mode === "dark" ? "15%" : "100%"
            }, 0.9) 10%, hsl(200, 0%, ${
              theme.palette.mode === "dark" ? "15%" : "100%"
            }) 100%)`,
            position: "relative",
            top: expanded ? 0 : "-12px",
            p: "12px 4px 4px 4px",
          }}
        >
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            startIcon={
              <ArrowDownward
                color="secondary"
                sx={{
                  transform: expanded ? "rotate(180deg)" : "unset",
                }}
              />
            }
            color="secondary"
          >
            Read {expanded ? "less" : "more"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

type EvaluationNotesProps = {
  notes?: string;
  showDefault?: boolean;
  variant: "overview" | "details";
};
