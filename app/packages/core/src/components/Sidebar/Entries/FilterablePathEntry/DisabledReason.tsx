import { ExternalLink, useTheme } from "@fiftyone/components";
import Launch from "@mui/icons-material/Launch";
import React from "react";

export default ({ href, text }: { href: string; text: string }) => {
  const theme = useTheme();
  return (
    <ExternalLink
      style={{ color: theme.text.primary, padding: "0.25rem" }}
      href={href}
    >
      {text} <Launch style={{ height: "1rem", marginTop: 7.5 }} />
    </ExternalLink>
  );
};
