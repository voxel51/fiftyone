import { useTrackEvent } from "@fiftyone/analytics";
import { Dialog } from "@fiftyone/components";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { editingFieldAtom, useMutation } from "@fiftyone/state";
import { EditNote, ExpandMore } from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useSetRecoilState } from "recoil";
import Error from "../../Error";
import EvaluationNotes from "../../EvaluationNotes";
import { useTriggerEvent } from "../../utils";
import ClassPerformance from "./ClassPerformance";
import ConfusionMatrices from "./ConfusionMatrices";
import MetricPerformance from "./MetricPerformance";
import Summary from "./Summary";

export default function Overview(props) {
  const {
    name,
    id,
    navigateBack,
    data,
    loadEvaluation,
    compareKey,
    setNoteEvent,
    notes = {},
    loadView,
  } = props;
  const [expanded, setExpanded] = usePanelStatePartial(
    `${name}_evaluation_overview_expanded`,
    "summary",
    true
  );
  const [editNoteState, setEditNoteState] = useState({ open: false, note: "" });
  const [loadingCompare, setLoadingCompare] = useState(false);
  const evaluation = useMemo(() => {
    const evaluation = data?.[`evaluation_${name}`];
    return evaluation;
  }, [data]);

  const compareEvaluation = useMemo(() => {
    const evaluation = data?.[`evaluation_${compareKey}`];
    return evaluation;
  }, [data]);
  const evaluationError = useMemo(() => {
    const evaluation = data?.[`evaluation_${name}_error`];
    return evaluation;
  }, [data]);

  const evaluationNotes = useMemo(() => {
    return notes[id];
  }, [notes, id]);

  const { can_edit_note } = data?.permissions || {};
  const [enable, message, cursor] = useMutation(
    can_edit_note,
    "edit evaluation note"
  );

  useEffect(() => {
    if (!evaluation) {
      loadEvaluation();
    }
  }, [evaluation]);

  useEffect(() => {
    if (!compareEvaluation && !loadingCompare && compareKey) {
      setLoadingCompare(true);
      loadEvaluation(compareKey);
    }
  }, [compareEvaluation, compareKey]);

  const triggerEvent = useTriggerEvent();
  const setEditingField = useSetRecoilState(editingFieldAtom);

  const trackEvent = useTrackEvent();

  const closeNoteDialog = () => {
    setEditNoteState((note) => ({ ...note, open: false }));
  };

  if (evaluationError) {
    return <Error onBack={navigateBack} />;
  }

  if (!evaluation) {
    return (
      <Box
        sx={{
          height: "50vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography color="secondary">Evaluation notes</Typography>
          <Box title={message} sx={{ cursor }}>
            <IconButton
              size="small"
              color="secondary"
              sx={{ borderRadius: 16 }}
              onClick={() => {
                setEditNoteState((note) => ({ ...note, open: true }));
              }}
              disabled={!enable}
            >
              <EditNote />
            </IconButton>
          </Box>
        </Stack>
        <EvaluationNotes notes={evaluationNotes} variant="details" />
      </Card>
      <Stack
        spacing={1}
        sx={{ ".MuiAccordionDetails-root": { overflow: "auto" } }}
      >
        <Accordion
          expanded={expanded === "summary"}
          onChange={(e, expanded) => {
            setExpanded(expanded ? "summary" : "");
            trackEvent("evaluation_card_click", {
              name: "summary",
              compare_evaluation: compareKey,
              evaluation_id: id,
            });
          }}
          disableGutters
          sx={{ borderRadius: 1, "&::before": { display: "none" } }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            Summary
          </AccordionSummary>
          <AccordionDetails>
            <Summary
              name={name}
              compareKey={compareKey}
              loadView={loadView}
              evaluation={evaluation}
              compareEvaluation={compareEvaluation}
            />
          </AccordionDetails>
        </Accordion>
        <Accordion
          expanded={expanded === "metric"}
          onChange={(e, expanded) => {
            setExpanded(expanded ? "metric" : "");
            trackEvent("evaluation_card_click", {
              name: "metric",
              compare_evaluation: compareKey,
              evaluation_id: id,
            });
          }}
          disableGutters
          sx={{ borderRadius: 1, "&::before": { display: "none" } }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            Metric Performance
          </AccordionSummary>
          <AccordionDetails>
            <MetricPerformance
              name={name}
              compareKey={compareKey}
              evaluation={evaluation}
              compareEvaluation={compareEvaluation}
            />
          </AccordionDetails>
        </Accordion>
        <Accordion
          expanded={expanded === "class"}
          onChange={(e, expanded) => {
            setExpanded(expanded ? "class" : "");
            trackEvent("evaluation_card_click", {
              name: "class",
              compare_evaluation: compareKey,
              evaluation_id: id,
            });
          }}
          disableGutters
          sx={{ borderRadius: 1, "&::before": { display: "none" } }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            Class Performance
          </AccordionSummary>
          <AccordionDetails>
            <ClassPerformance
              evaluation={evaluation}
              compareEvaluation={compareEvaluation}
              loadView={loadView}
              name={name}
              compareKey={compareKey}
            />
          </AccordionDetails>
        </Accordion>
        <Accordion
          expanded={expanded === "matrices"}
          onChange={(e, expanded) => {
            setExpanded(expanded ? "matrices" : "");
            trackEvent("evaluation_card_click", {
              name: "matrices",
              compare_evaluation: compareKey,
              evaluation_id: id,
            });
          }}
          disableGutters
          sx={{ borderRadius: 1, "&::before": { display: "none" } }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            Confusion Matrices
          </AccordionSummary>
          <AccordionDetails>
            <ConfusionMatrices
              evaluation={evaluation}
              compareEvaluation={compareEvaluation}
              name={name}
              compareKey={compareKey}
              loadView={loadView}
            />
          </AccordionDetails>
        </Accordion>
      </Stack>

      <Dialog open={editNoteState.open} fullWidth onClose={closeNoteDialog}>
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <EditNote sx={{ fontSize: 16 }} color="secondary" />
            <Typography sx={{ fontSize: 16 }} color="secondary">
              {evaluationNotes ? "Edit" : "Add"} evaluation notes
            </Typography>
          </Stack>
          <TextField
            onFocus={() => {
              setEditingField(true);
            }}
            onBlur={() => {
              setEditingField(false);
            }}
            multiline
            rows={10}
            defaultValue={evaluationNotes}
            placeholder="Note (markdown) for the evaluation..."
            onChange={(e) => {
              setEditNoteState((note) => ({ ...note, note: e.target.value }));
            }}
          />
          <Stack direction={"row"} spacing={1}>
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
    </Box>
  );
}
