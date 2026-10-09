import { LaunchIcon } from "@voxel51/voodo";
import { ExternalLink, useTheme } from "@fiftyone/components";

export default ({ href, text }: { href: string; text: string }) => {
  const theme = useTheme();
  return (
    <ExternalLink
      style={{ color: theme.text.primary, padding: "0.25rem" }}
      href={href}
    >
      {text} <LaunchIcon size={16} style={{ marginTop: 7.5 }} />
    </ExternalLink>
  );
};
