import { Box } from "@mui/material";
import { getComponentProps } from "../utils";
import PillBadge from "@fiftyone/components/src/components/PillBadge/PillBadge";

export default function PillBadgeView(props) {
  const { schema } = props;
  const { view = {}, onChange } = schema;
  const { text, color, variant, showIcon } = view;

  return (
    <Box {...getComponentProps(props, "container")}>
      <PillBadge
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
