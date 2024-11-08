import { Button, CircularProgress, Alert, AlertTitle } from "@mui/material";
import {
  Box,
  TextInput,
  TextInputCopy,
  Dialog,
} from "@fiftyone/teams-components";
import {
  showGenerateAPITokenDialog,
  apiTokensGenerateMutation,
} from "@fiftyone/teams-state";
import { useRecoilState } from "recoil";
import { Typography } from "@mui/material";
import { useCallback, useState } from "react";
import { get } from "lodash";
import { useMutation } from "@fiftyone/hooks";

type GenerateAPITokenProps = {
  onGenerate?: Function;
};

export default function GenerateAPIToken(props: GenerateAPITokenProps) {
  const [open, setOpen] = useRecoilState(showGenerateAPITokenDialog);
  const [tokenName, setTokenName] = useState("");
  const [token, setToken] = useState("");
  const [generateAPIToken, generatingAPIToken] = useMutation(
    apiTokensGenerateMutation
  );
  const { onGenerate } = props;

  const handleClose = useCallback(() => {
    setOpen(false);
    setTokenName("");
    setToken("");
  }, [setOpen, setTokenName, setToken]);

  return (
    <Dialog
      title="Generate API key"
      open={open}
      onClose={handleClose}
      hideActionButtons
    >
      <Box>
        {token && (
          <Box sx={{ pb: 2 }}>
            <Alert severity="info" variant="outlined">
              <AlertTitle>
                This key will not be visible after you close this window
              </AlertTitle>
              <Typography variant="caption">
                Copy and paste this key in a safe place. If you lose it, you
                will have to regenerate a new key
              </Typography>
            </Alert>
          </Box>
        )}
        <Box>
          <TextInput
            fieldLabel="Key nickname"
            placeholder="Bob's key for MacBook Pro CLI"
            fullWidth
            disabled={generatingAPIToken || !!token}
            onChange={(e) => {
              setTokenName(e.target.value);
            }}
          />
          <Typography variant="caption">
            Give your key a name to help you remember what it&apos;s used for.
          </Typography>
        </Box>
        {token && (
          <Box paddingTop={3}>
            {/* @ts-ignore */}
            <TextInputCopy fieldLabel="Key" value={token.key} fullWidth />
          </Box>
        )}
        <Box
          paddingTop={3}
          sx={{
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          {!token && (
            <>
              <Button
                onClick={() => {
                  setOpen(false);
                }}
                variant="outlined"
                disabled={generatingAPIToken}
              >
                Cancel
              </Button>
              <Button
                onClick={(e) => {
                  generateAPIToken({
                    successMessage: "Successfully generated a new API key",
                    errorMessage: "Failed to generate an API key",
                    variables: {
                      name: tokenName,
                    },
                    onCompleted(data) {
                      const newToken = get(data, "generateApiKey");
                      setToken(newToken);
                      if (onGenerate) onGenerate(newToken);
                    },
                    onError(error) {
                      console.error(error);
                    },
                  });
                }}
                variant="contained"
                sx={{ marginLeft: 2, minWidth: "10rem" }}
                disabled={generatingAPIToken || !tokenName}
              >
                Generate key
                {generatingAPIToken && (
                  <CircularProgress size={16} sx={{ position: "absolute" }} />
                )}
              </Button>
            </>
          )}
          {token && (
            <Button onClick={handleClose} variant="outlined">
              Close
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
