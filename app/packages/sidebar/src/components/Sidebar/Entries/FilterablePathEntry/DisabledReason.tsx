import { LaunchIcon } from "@voxel51/voodo";
import { ExternalLink } from "../../../../utils/generic";

export default ({ href, text }: { href: string; text: string }) => {
  return (
    <ExternalLink style={{ padding: "0.25rem" }} href={href}>
      {text} <LaunchIcon size={16} style={{ marginTop: 7.5 }} />
    </ExternalLink>
  );
};
