import { capitalize } from "lodash";

import { IconButton } from "@mui/material";

import CallSplitOutlinedIcon from "@mui/icons-material/CallSplitOutlined";
import CrisisAlertOutlinedIcon from "@mui/icons-material/CrisisAlertOutlined";
import Layers from "@mui/icons-material/Layers";
import PieChartOutlinedIcon from "@mui/icons-material/PieChartOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";

import TooltipProvider from "../TooltipProvider";
import { ConcreteEvaluationType } from "./Types";

interface Props {
  type: ConcreteEvaluationType;
  method?: string;
  color?: string;
}

export default function EvaluationIcon(props: Props) {
  const { type, method, color } = props;

  let evalIcon = <Layers />;
  if (type === "classification" && method === "binary") {
    evalIcon = <CallSplitOutlinedIcon />;
  } else if (type === "classification" && method !== "binary") {
    evalIcon = <Layers />;
  } else if (type === "detection") {
    evalIcon = <CrisisAlertOutlinedIcon />;
  } else if (type === "segmentation") {
    evalIcon = <PieChartOutlinedIcon />;
  } else if (type === "regression") {
    evalIcon = <ShowChartOutlinedIcon />;
  }

  return (
    <TooltipProvider
      title={
        <span style={{ fontSize: "1rem", fontWeight: "normal" }}>
          Evaluation type: {capitalize(type)}
        </span>
      }
      arrow
      placement="bottom"
    >
      <IconButton
        size="small"
        sx={{
          color: color ?? "#FFC48B",
          "&:hover": {
            backgroundColor: "transparent",
          },
        }}
      >
        {evalIcon}
      </IconButton>
    </TooltipProvider>
  );
}
