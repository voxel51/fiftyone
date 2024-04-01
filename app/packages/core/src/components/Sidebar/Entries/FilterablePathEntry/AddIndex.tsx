import { ExternalLink, useTheme } from "@fiftyone/components";
import Launch from "@mui/icons-material/Launch";
import React from "react";
import { LIGHTNING_MODE } from "../../../../utils/links";

export default function AddIndex() {
  const theme = useTheme();
  return (
    <ExternalLink
      style={{ color: theme.text.primary, padding: "0.25rem" }}
      href={LIGHTNING_MODE}
    >
      add an index <Launch style={{ height: "1rem", marginTop: 7.5 }} />
    </ExternalLink>
  );
}
