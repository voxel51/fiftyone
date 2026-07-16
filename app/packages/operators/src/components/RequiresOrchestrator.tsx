import { Link } from "@mui/material";
import { OrchestratorIcon, RichCard, Variant, Button } from "@voxel51/voodo";

export default function RequiresOrchestrator() {
  return (
    <RichCard
      title="Background compute is not yet configured"
      description="Production workflows require dedicated compute resources."
      icon={OrchestratorIcon}
      compact
      action={<SetupNow />}
    />
  );
}
function SetupNow() {
  return (
    <Link
      href="https://docs.voxel51.com/plugins/using_plugins.html#delegated-operations"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Button variant={Variant.Secondary}>Set up now</Button>
    </Link>
  );
}
