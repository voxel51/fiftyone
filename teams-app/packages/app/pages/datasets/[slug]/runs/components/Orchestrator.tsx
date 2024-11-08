import { BasicTable, Timestamp, scrollable } from "@fiftyone/teams-components";
import {
  orchestratorDialogAtom,
  runsOrchestratorQuery,
  runsOrchestratorQueryT,
  runsOrchestratorsQuery$dataT,
} from "@fiftyone/teams-state";
import { Close } from "@mui/icons-material";
import {
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from "@mui/material";
import { Suspense, useCallback } from "react";
import { useLazyLoadQuery } from "react-relay";
import { useRecoilState } from "recoil";

export default function Orchestrator() {
  const [state, setState] = useRecoilState(orchestratorDialogAtom);
  const { description, id, open } = state;

  const handleClose = useCallback(() => {
    setState((state) => ({ ...state, open: false }));
  }, [setState]);

  return (
    <Dialog open={open} fullWidth onClose={handleClose}>
      <DialogTitle>
        <Stack>
          <Typography variant="h6">{description}</Typography>
          <Subtitle {...state} />
          <Typography variant="body2" pt={2}>
            Available operators
          </Typography>
        </Stack>
        <IconButton
          sx={{ position: "absolute", top: 16, right: 16 }}
          onClick={handleClose}
        >
          <Close color="secondary" />
        </IconButton>
      </DialogTitle>
      <DialogContent className={scrollable}>
        <Suspense>
          <OrchestratorOperators id={id} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function OrchestratorOperators(props: { id: string }) {
  const { id } = props;
  const data = useLazyLoadQuery<runsOrchestratorQueryT>(runsOrchestratorQuery, {
    orchestratorIdentifier: id,
  });
  const operators = data?.orchestrator?.availableOperators || [];

  if (operators.length === 0)
    return <Typography>No operators available</Typography>;
  return (
    <BasicTable
      rows={operators.map((operator) => ({
        id: operator,
        cells: [{ id: operator + "-label", value: operator }],
      }))}
    />
  );
}

export function Subtitle(props: SubtitlePropsType) {
  const { createdAt, deactivatedAt, updatedAt } = props;

  return (
    <Stack
      direction="row"
      divider={<Typography>&#x2022;</Typography>}
      spacing={1}
    >
      {updatedAt && (
        <Typography>
          Last updated <Timestamp timestamp={updatedAt} />
        </Typography>
      )}
      <Typography>
        {deactivatedAt ? "Deactivated" : "Created"}{" "}
        <Timestamp timestamp={deactivatedAt || createdAt} />
      </Typography>
    </Stack>
  );
}

type OrchestratorNode =
  runsOrchestratorsQuery$dataT["orchestratorsPage"]["nodes"][number];

type SubtitlePropsType = {
  createdAt: OrchestratorNode["createdAt"];
  deactivatedAt: OrchestratorNode["deactivatedAt"];
  updatedAt: OrchestratorNode["updatedAt"];
};
