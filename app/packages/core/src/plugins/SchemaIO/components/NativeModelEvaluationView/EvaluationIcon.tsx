import { TooltipProvider } from "@fiftyone/components";
import CallSplitOutlinedIcon from "@mui/icons-material/CallSplitOutlined";
import CrisisAlertOutlinedIcon from "@mui/icons-material/CrisisAlertOutlined";
import Layers from "@mui/icons-material/Layers";
import PieChartOutlinedIcon from "@mui/icons-material/PieChartOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import { Box } from "@mui/material";
import { capitalize } from "lodash";
import { ConcreteEvaluationType } from "./Types";

interface Props {
  type?: ConcreteEvaluationType;
  method?: string;
  color?: string;
}

export default function EvaluationIcon(props: Props) {
  const { type, method, color } = props;

  let IconComponent = Layers;
  if (type === "classification" && method === "binary") {
    IconComponent = CallSplitOutlinedIcon;
  } else if (type === "classification" && method !== "binary") {
    IconComponent = Layers;
  } else if (type === "detection") {
    IconComponent = CrisisAlertOutlinedIcon;
  } else if (type === "segmentation") {
    IconComponent = PieChartOutlinedIcon;
  } else if (type === "regression") {
    IconComponent = ShowChartOutlinedIcon;
  }

  return (
    <TooltipProvider
      title={type ? `Evaluation type: ${capitalize(type)}` : undefined}
    >
      <Box sx={{ display: "flex" }}>
        <IconComponent sx={{ color: color ?? "#FFC48B" }} />
      </Box>
    </TooltipProvider>
  );
}
