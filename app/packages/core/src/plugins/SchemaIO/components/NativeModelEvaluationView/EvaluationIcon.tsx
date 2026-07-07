import {
  TooltipProvider,
  MuiCallSplitOutlinedIcon as CallSplitOutlinedIcon,
  MuiCrisisAlertOutlinedIcon as CrisisAlertOutlinedIcon,
  MuiLayersIcon as Layers,
  MuiPieChartOutlinedIcon as PieChartOutlinedIcon,
  MuiShowChartOutlinedIcon as ShowChartOutlinedIcon,
} from "@fiftyone/components";
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
