/**
 * The panel view: two independent state machines, rendered top to bottom.
 *
 * `connection` gates everything — nothing about uploading is shown until a
 * key is present. Below it, `push` picks exactly one card. The component
 * itself holds no state; `useCloudPanel` is the only thing it calls.
 */

import { Orientation, Spacing, Stack } from "@voxel51/voodo";

import { ConnectCard } from "./components/ConnectCard";
import { ConnectedBar } from "./components/ConnectedBar";
import { PairingCard } from "./components/PairingCard";
import { PlanningCard } from "./components/PlanningCard";
import { PreviewStep } from "./components/PreviewStep";
import { ProgressCard } from "./components/ProgressCard";
import { ResultCard } from "./components/ResultCard";
import { UploadForm } from "./components/UploadForm";
import { useCloudPanel } from "./hooks/useCloudPanel";
import {
  CloudPanelProps,
  ConnectionStatus,
  PushData,
  PushStatus,
} from "./types";

export function CloudPanelView(props: CloudPanelProps) {
  const { connection, form, push, pushActions, actions } = useCloudPanel(props);
  const view = props.schema?.view;

  return (
    <Stack
      orientation={Orientation.Column}
      spacing={Spacing.Md}
      className="p-4"
    >
      {connection.status === ConnectionStatus.Disconnected && (
        // A disconnected panel has no upload form: there is nowhere to
        // upload to, and the old flow's prompt chain existed only to paper
        // over that.
        <ConnectCard
          form={form}
          error={connection.error}
          connecting={actions.pairing.isStarting}
          onConnect={() => void actions.connect()}
        />
      )}

      {connection.status === ConnectionStatus.Pairing && connection.pairing && (
        <PairingCard
          pairing={connection.pairing}
          onCancel={() => void actions.pairing.cancel()}
          onRetry={() => void actions.pairing.retry()}
        />
      )}

      {connection.status === ConnectionStatus.Connected && view && (
        <>
          <ConnectedBar
            connection={connection}
            onDisconnect={() => void actions.disconnect()}
          />
          <PushSection
            push={push}
            actions={pushActions}
            view={view}
            apiUrl={connection.api_url}
          />
        </>
      )}
    </Stack>
  );
}

function PushSection(props: {
  push: PushData;
  actions: ReturnType<typeof useCloudPanel>["pushActions"];
  view: NonNullable<CloudPanelProps["schema"]>["view"];
  apiUrl: string;
}) {
  const { push, actions, view, apiUrl } = props;

  switch (push.status) {
    case PushStatus.Planning:
      return <PlanningCard push={push} />;
    case PushStatus.Preview:
      return (
        <PreviewStep
          push={push}
          confirming={actions.isExecuting}
          onConfirm={actions.confirm}
          onBack={actions.back}
        />
      );
    case PushStatus.Running:
      return <ProgressCard push={push} />;
    case PushStatus.Done:
    case PushStatus.Failed:
      return (
        <ResultCard
          push={push}
          apiUrl={apiUrl}
          onReset={() => void actions.reset()}
        />
      );
    default:
      return (
        <UploadForm
          view={view}
          selection={actions.selection}
          onTargetChange={actions.setTarget}
          onDatasetNameChange={actions.setDatasetName}
          onUpload={actions.preview}
        />
      );
  }
}
