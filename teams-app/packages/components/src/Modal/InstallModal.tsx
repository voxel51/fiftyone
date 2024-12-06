import { useBooleanEnv } from "@fiftyone/hooks/src/common/useEnv";
import { Dialog } from "@fiftyone/teams-components";
import { FIFTYONE_APP_DEMO_MODE } from "@fiftyone/teams-state/src/constants";
import DemoInstallContent from "./DemoInstallContent";
import InstallContent from "./InstallContent";

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function InstallModal(props: Props) {
  const demoMode = useBooleanEnv(FIFTYONE_APP_DEMO_MODE);
  return (
    <Dialog
      data-testid="dialog"
      title="Install FiftyOne"
      open={props.open}
      fullWidth
      hideActionButtons
      onClose={props.onClose}
    >
      {demoMode ? <DemoInstallContent /> : <InstallContent />}
    </Dialog>
  );
}
