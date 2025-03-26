import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Dialog,
  IconButton,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowDropDown, ArrowDropUp, EditNote } from "@mui/icons-material";
import { ExpandMore } from "@mui/icons-material";
import { useRecoilState } from "recoil";
import { editingFieldAtom } from "@fiftyone/state";
import { EvaluationTable } from "../styles";
import EvaluationNotes from "../EvaluationNotes";
import EvaluationPlot from "../EvaluationPlot";
import { formatValue, getNumericDifference } from "../utils";

interface OverviewProps {
  mode: string;
  expanded: string;
  setExpanded: (expanded: string) => void;
  evaluationNotes: string;
  can_edit_note: boolean;
  setEditNoteState: (state: { open: boolean; note: string }) => void;
  evaluation: any;
  compareKey: string;
  name: string;
  compareEvaluation: any;
  activeFilter: any;
  loadView: (type: string, params: any) => void;
  setNoteEvent: string;
  triggerEvent: (event: string, params: any) => void;
  closeNoteDialog: () => void;
  editNoteState: { open: boolean; note: string };
  KEY_COLOR: string;
  COMPARE_KEY_COLOR: string;
}

export default function Overview({
  mode,
  expanded,
  setExpanded,
  evaluationNotes,
  can_edit_note,
  setEditNoteState,
  evaluation,
  compareKey,
  name,
  compareEvaluation,
  activeFilter,
  loadView,
  setNoteEvent,
  triggerEvent,
  closeNoteDialog,
  editNoteState,
  KEY_COLOR,
  COMPARE_KEY_COLOR,
}: OverviewProps) {
  const setEditingField = useRecoilState(editingFieldAtom);

  const summaryRows = [
    {
      id: "average_confidence",
      property: "Average Confidence",
      value: evaluation?.metrics?.average_confidence,
      compareValue: compareEvaluation?.metrics?.average_confidence,
      hide: evaluation?.info?.config?.type === "segmentation",
    },
    {
      id: "support",
      property: "Support",
      value: evaluation?.metrics?.support,
      compareValue: compareEvaluation?.metrics?.support,
    },
    {
      id: "accuracy",
      property: "Accuracy",
      value: evaluation?.metrics?.accuracy,
      compareValue: compareEvaluation?.metrics?.accuracy,
    },
    {
      id: "precision",
      property: "Precision",
      value: evaluation?.metrics?.precision,
      compareValue: compareEvaluation?.metrics?.precision,
    },
    {
      id: "recall",
      property: "Recall",
      value: evaluation?.metrics?.recall,
      compareValue: compareEvaluation?.metrics?.recall,
    },
    {
      id: "fscore",
      property: "F1-Score",
      value: evaluation?.metrics?.fscore,
      compareValue: compareEvaluation?.metrics?.fscore,
    },
  ];

  return (
    <>
      <Card sx={{ p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography color="secondary">Evaluation notes</Typography>
          <Box
            title={
              can_edit_note
                ? ""
                : "You do not have permission to edit evaluation notes"
            }
            sx={{ cursor: can_edit_note ? "pointer" : "not-allowed" }}
          >
            <IconButton
              size="small"
              color="secondary"
              sx={{ borderRadius: 16 }}
              onClick={() => {
                setEditNoteState((note) => ({ ...note, open: true }));
              }}
              disabled={!can_edit_note}
            >
              <EditNote />
            </IconButton>
          </Box>
        </Stack>
        <EvaluationNotes notes={evaluationNotes} variant="details" />
      </Card>

      {mode === "chart" && (
        <Stack spacing={1}>
          <Accordion
            expanded={expanded === "summary"}
            onChange={(e, expanded) => {
              setExpanded(expanded ? "summary" : "");
            }}
            disableGutters
            sx={{ borderRadius: 1, "&::before": { display: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              Summary
            </AccordionSummary>
            <AccordionDetails>
              <EvaluationTable>
                <TableHead>
                  <TableRow>
                    <TableCell>Metric</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ColorSquare color={KEY_COLOR} />
                        <Typography>{name}</Typography>
                      </Stack>
                    </TableCell>
                    {compareKey && (
                      <>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <ColorSquare color={COMPARE_KEY_COLOR} />
                            <Typography>{compareKey}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>Difference</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summaryRows.map((row) => {
                    if (row.hide) return null;
                    const difference = getNumericDifference(
                      row.value,
                      row.compareValue
                    );
                    const ratio = getNumericDifference(
                      row.value,
                      row.compareValue,
                      true,
                      1
                    );
                    const positiveRatio = ratio > 0;
                    const negativeRatio = ratio < 0;
                    const ratioColor = positiveRatio
                      ? "#8BC18D"
                      : negativeRatio
                      ? "#FF6464"
                      : "#999999";

                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.property}</TableCell>
                        <TableCell>{formatValue(row.value)}</TableCell>
                        {compareKey && (
                          <>
                            <TableCell>
                              {formatValue(row.compareValue)}
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                              >
                                <Typography>{difference}</Typography>
                                {!isNaN(ratio) && (
                                  <>
                                    {positiveRatio && (
                                      <ArrowDropUp sx={{ color: ratioColor }} />
                                    )}
                                    {negativeRatio && (
                                      <ArrowDropDown
                                        sx={{ color: ratioColor }}
                                      />
                                    )}
                                    <Typography sx={{ color: ratioColor }}>
                                      {ratio}%
                                    </Typography>
                                  </>
                                )}
                              </Stack>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </EvaluationTable>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}

      <Dialog
        open={editNoteState.open}
        fullWidth
        onClose={closeNoteDialog}
        PaperProps={{
          sx: { background: (theme) => theme.palette.background.paper },
        }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <EditNote sx={{ fontSize: 16 }} color="secondary" />
            <Typography sx={{ fontSize: 16 }} color="secondary">
              {evaluationNotes ? "Edit" : "Add"} evaluation notes
            </Typography>
          </Stack>
          <TextField
            onFocus={() => setEditingField(true)}
            onBlur={() => setEditingField(false)}
            multiline
            rows={10}
            defaultValue={evaluationNotes}
            placeholder="Note (markdown) for the evaluation..."
            onChange={(e) => {
              setEditNoteState((note) => ({ ...note, note: e.target.value }));
            }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="secondary"
              sx={{ width: "50%" }}
              onClick={closeNoteDialog}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              sx={{ width: "50%" }}
              onClick={() => {
                triggerEvent(setNoteEvent, { note: editNoteState.note });
                closeNoteDialog();
              }}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </Dialog>
    </>
  );
}

function ColorSquare({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        backgroundColor: color,
        borderRadius: 2,
      }}
    />
  );
}
