import { withPermissions } from "@fiftyone/hooks";
import { mainTitleSelector, MANAGE_ORGANIZATION } from "@fiftyone/teams-state";
import {
  EmptyState,
  SectionHeader,
  SettingsLayout,
  TableContainer,
  TableSkeleton,
} from "@fiftyone/teams-components";
import { Button, Table, TableBody } from "@mui/material";
import { useEffect } from "react";
import { useSetRecoilState } from "recoil";
import SecretRow from "./components/secret-row";
import CreateSecret from "./components/create-secret";

import { showCreateSecretDialog } from "@fiftyone/teams-state/src/Settings/secrets";
import useCurrentSecrets from "@fiftyone/hooks/src/settings/useCurrentSecrets";
import { Add } from "@mui/icons-material";

function SecretsManagement() {
  const setShowCreateDialog = useSetRecoilState(showCreateSecretDialog);

  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle("Settings");
  }, []);

  const [uploadedSecrets, refresh] = useCurrentSecrets("store-and-network");

  const currentSecrets = uploadedSecrets || [];

  return (
    <SettingsLayout>
      <SectionHeader
        title="Secrets Management"
        description={
          "Manage secrets for your organization. These secrets are used to" +
          " provide access to external services from within FiftyOne."
        }
      >
        <Button
          onClick={() => {
            setShowCreateDialog(true);
          }}
          variant="contained"
          startIcon={<Add />}
        >
          Add secret
        </Button>
      </SectionHeader>
      <CreateSecret
        onCreated={() => {
          refresh();
          setShowCreateDialog(false);
        }}
      />
      {currentSecrets.length === 0 && <EmptyState resource="secrets" />}
      {currentSecrets.length > 0 && (
        <TableContainer>
          <Table>
            <TableBody>
              {currentSecrets.map((secret) => (
                <SecretRow
                  key={secret.secretKey}
                  onDelete={() => {
                    refresh();
                  }}
                  onUpdate={() => {
                    refresh();
                  }}
                  {...secret}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SettingsLayout>
  );
}

export { getServerSideProps } from "lib/env";

function LoadingComponent() {
  return <TableSkeleton />;
}
export default withPermissions(
  SecretsManagement,
  [MANAGE_ORGANIZATION],
  "user"
);
