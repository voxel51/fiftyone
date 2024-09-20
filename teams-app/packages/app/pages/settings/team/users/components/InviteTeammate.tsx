import {
  useMutation,
  useUpdateInvitationsList,
  useUserAudit,
  useUserRole,
} from "@fiftyone/hooks";
import {
  CodeTabs,
  Dialog,
  RoleSelection,
  TextInput,
} from "@fiftyone/teams-components";
import {
  currentInviteeState,
  settingsTeamInviteTeammateOpen,
  teamInvitationFormState,
  teamSendUserInvitationMutation,
} from "@fiftyone/teams-state";
import { Alert, AlertTitle, Box, InputLabel, Typography } from "@mui/material";
import { teamSendUserInvitationMutation as teamSendUserInvitationMutationType } from "queries/__generated__/teamSendUserInvitationMutation.graphql";
import { useState } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import LicenseAudit from "./LicenseAudit";

type InviteTeammateProps = {
  onInvite?: Function;
  limitWarning?: boolean;
};

export default function InviteTeammate({ onInvite }: InviteTeammateProps) {
  const { hasSeatsLeft } = useUserAudit();
  const [errorMsg, setErrorMsg] = useState(null);
  const [url, setUrl] = useState("");
  const [sendInvite, sendInviteInProgress] =
    useMutation<teamSendUserInvitationMutationType>(
      teamSendUserInvitationMutation
    );
  const [open, setOpen] = useRecoilState(settingsTeamInviteTeammateOpen);
  const [invitationForm, setInvitationForm] = useRecoilState(
    teamInvitationFormState
  );
  const { email, id, role } = invitationForm;
  const editMode = id !== "";

  const currInvitee = useRecoilValue(currentInviteeState);
  const resetInvitee = useResetRecoilState(currentInviteeState);

  const updateInvitationsList = useUpdateInvitationsList();
  const { getInviteRoles } = useUserRole();

  const inviteeRole = editMode ? currInvitee.role : undefined;
  const items = getInviteRoles(inviteeRole);

  function handleClose() {
    resetInvitee();
    setInvitationForm({ email: "", id: "", role: "MEMBER" });
    setUrl("");
    setOpen(false);
  }

  // if current role is disabled
  const selectionNotValid = items.filter((item) => item.id === role)?.disabled;

  return (
    <Dialog
      open={open}
      title={editMode ? "Edit invitation" : "Invite new teammate"}
      onClose={() => {
        handleClose();
      }}
      onConfirm={() => {
        sendInvite({
          successMessage: "Successfully sent an invitation",
          variables: { email, role },
          onCompleted(data) {
            if (onInvite) onInvite(data);
            const invitation = data?.sendUserInvitation;
            if (invitation) {
              updateInvitationsList({
                id: editMode ? id : undefined,
                invitation,
              });
            }
          },
          onSuccess(data) {
            setUrl(data.sendUserInvitation.url);
          },
          onError(error) {
            const msg =
              error?.source?.errors[0]?.message ||
              error?.message ||
              "An unknown error occured";
            setErrorMsg(msg);
          },
        });
      }}
      fullWidth
      loading={sendInviteInProgress}
      disableConfirmationButton={
        sendInviteInProgress ||
        errorMsg !== null ||
        (hasSeatsLeft && !hasSeatsLeft(role)) ||
        (currInvitee && currInvitee.role === role) ||
        selectionNotValid ||
        !url
      }
    >
      <Box>
        <LicenseAudit />
        {errorMsg ? <InviteError>{errorMsg}</InviteError> : null}
        <TextInput
          fullWidth
          fieldLabel="Invitee email"
          placeholder="test@org.com"
          onChange={(e) => {
            setErrorMsg(null);
            setInvitationForm({ ...invitationForm, email: e.target.value });
          }}
          type="email"
          value={email}
          disabled={editMode}
        />
        <InputLabel sx={{ paddingTop: 2 }}>Role</InputLabel>
        <RoleSelection
          items={items}
          defaultValue={role}
          selectProps={{ fullWidth: true, size: "medium" }}
          onChange={(role) => {
            setInvitationForm({ ...invitationForm, role });
          }}
        />
      </Box>
      {url !== "" && <InviteUrl url={url} />}
    </Dialog>
  );
}

function InviteUrl({ url }) {
  return (
    <CodeTabs
      tabs={[
        {
          id: "invitee-url",
          label: "Invitee URL",
          code: url,
          customStyle: { height: "4rem", overflow: "auto" },
        },
      ]}
    />
  );
}

function InviteError({ children }) {
  return (
    <Box paddingBottom={2}>
      <Alert severity="error" variant="outlined">
        {/* @ts-ignore */}
        <AlertTitle>There was an issue with your invitation</AlertTitle>
        <Typography variant="body1">{children}</Typography>
      </Alert>
    </Box>
  );
}
