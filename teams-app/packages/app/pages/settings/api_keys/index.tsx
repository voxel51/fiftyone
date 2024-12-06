import { useCurrentUser, withPermissions } from "@fiftyone/hooks";
import {
  VIEW_API_KEYS,
  mainTitleSelector,
  showGenerateAPITokenDialog,
} from "@fiftyone/teams-state";
import {
  Box,
  EmptyState,
  SectionHeader,
  SettingsLayout,
  TableContainer,
} from "@fiftyone/teams-components";
import { Button, Table, TableBody } from "@mui/material";
import { useEffect } from "react";
import { useSetRecoilState } from "recoil";
import APITokenRow from "./components/api-token-row";
import GenerateAPIToken from "./components/generate-api-token";
import InstallContent from "@fiftyone/teams-components/src/Modal/InstallContent";

function APITokens() {
  const showGenerateTokenDialog = useSetRecoilState(showGenerateAPITokenDialog);

  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle("Settings");
  }, []);

  const [currentUser, refresh] = useCurrentUser("store-and-network");
  const apiKeys = currentUser?.apiKeys || [];

  return (
    <SettingsLayout>
      <SectionHeader
        title="API keys"
        description={`These keys allow members to access FiftyOne through our
         command line and Python client. Keys are only shown once—if you lose
          your key, you must deactivate it and generate a new key.`}
      >
        <Button
          onClick={() => {
            showGenerateTokenDialog(true);
          }}
          variant="contained"
        >
          Generate API key
        </Button>
      </SectionHeader>
      <GenerateAPIToken
        onGenerate={() => {
          refresh();
        }}
      />
      {apiKeys.length === 0 && <EmptyState resource="API keys" />}
      {apiKeys.length > 0 && (
        <TableContainer
          sx={{
            border: (theme) => `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
          }}
        >
          <Table>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <APITokenRow
                  key={apiKey.id}
                  onDelete={() => {
                    refresh();
                  }}
                  {...apiKey}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Box
        p={2}
        mt={2}
        sx={{ backgroundColor: (theme) => theme.palette.background.primary }}
      >
        <InstallContent hideInstallLink />
      </Box>
    </SettingsLayout>
  );
}

export { getServerSideProps } from "lib/env";

export default withPermissions(APITokens, [VIEW_API_KEYS], "user");
