import { Link } from "@mui/material";
import { IconName, RichCard, Variant, Button } from "@voxel51/voodo";

export default function RequiresOrchestrator() {
  return (
    <RichCard
      title="Background compute is not yet configured"
      description="Production workflows require dedicated compute resources."
      icon={IconName.Orchestrator}
      compact
      action={
        <Link
          href="https://docs.voxel51.com/plugins/using_plugins.html#delegated-operations"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant={Variant.Secondary}>Set up now</Button>
        </Link>
      }
    />
  );
}
