import { Box } from "@mui/material";
import { OPERATOR_PROMPT_AREAS } from "../constants";

export default function OperatorPromptArea(props: OperatorPromptAreaPropsType) {
  const { area } = props;
  return <Box id={area}></Box>;
}

type OperatorPromptAreaPropsType = {
  area: OPERATOR_PROMPT_AREAS;
};
