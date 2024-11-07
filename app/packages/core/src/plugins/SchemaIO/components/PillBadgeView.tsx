import { Box } from "@mui/material";
import { getComponentProps } from "../utils";
import PillBadge from "@fiftyone/components/src/components/PillBadge/PillBadge";
import { ViewPropsType } from "../utils/types";

export default function PillBadgeView(props: ViewPropsType) {
  const { schema } = props;
  const { view = {}, onChange } = schema;
  const { text, color, variant, showIcon, read_only: readOnly } = view;

  return (
    <Box {...getComponentProps(props, "container")}>
      <PillBadge
        readOnly={readOnly}
        text={text}
        color={color}
        variant={variant}
        showIcon={showIcon}
        operator={onChange}
        {...getComponentProps(props, "pillBadge")}
      />
    </Box>
  );
}
