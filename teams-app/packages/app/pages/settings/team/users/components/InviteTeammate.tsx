import {
  useMutation,
  useUpdateInvitationsList,
  useUserAudit,
  useUserRole,
} from "@fiftyone/hooks";
import { Dialog, RoleSelection, TextInput } from "@fiftyone/teams-components";
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
import InviteUrl from "./invitationUrl";
import * as EmailValidator from "email-validator";

type InviteTeammateProps = {
  onInvite?: Function;
  limitWarning?: boolean;
};

export default function InviteTeammate({ onInvite }: InviteTeammateProps) {
  const { hasSeatsLeft } = useUserAudit();
  const [errorMsg, setErrorMsg] = useState(null);
  const [url, setUrl] = useState("");
  const [emailSendAttempted, setEmailSendAttempted] = useState(false);
  const [sendInvite, sendInviteInProgress] =
    useMutation<teamSendUserInvitationMutationType>(
      teamSendUserInvitationMutation
    );
  const [open, setOpen] = useRecoilState(settingsTeamInviteTeammateOpen);
  const [inviteSent, setInviteSent] = useState(false);
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
  const hasInvitationLink = Boolean(url !== "");

  // check if email address looks like an email address
  const [isValidEmail, setIsValidEmail] = useState(true);

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const email = event.target.value;
    setIsValidEmail(checkValidEmail(email));
  };

  function handleClose() {
    resetInvitee();
    setInvitationForm({ email: "", id: "", role: "MEMBER" });
    setUrl("");
    setEmailSendAttempted(false);
    setErrorMsg(null);
    setOpen(false);
    setInviteSent(false);
    setIsValidEmail(true);
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
          successMessage: `Successfully invited ${email}`,
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
            const { url, emailSendAttemptedAt, emailSentAt } =
              data.sendUserInvitation;
            setUrl(url);
            setEmailSendAttempted(!!emailSendAttemptedAt);
            setInviteSent(!!emailSendAttemptedAt && !!emailSentAt);
          },
          onError(error) {
            const srcErrors = error?.source?.errors || [];
            const msg =
              srcErrors[0]?.message ||
              error?.message ||
              "An unknown error occurred";
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
        url.length > 0 ||
        isValidEmail === false
      }
      confirmationButtonText={"Send invitation"}
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
            setUrl("");
            handleEmailChange(e);
            setInviteSent(false);
            setEmailSendAttempted(false);
          }}
          type="email"
          value={email}
          disabled={editMode}
          helperText={
            !isValidEmail && (
              <Typography color="error">
                Please enter a valid email address
              </Typography>
            )
          }
        />
        <InputLabel sx={{ paddingTop: 2 }}>Role</InputLabel>
        <RoleSelection
          items={items}
          defaultValue={role}
          selectProps={{ fullWidth: true, size: "medium" }}
          onChange={(role) => {
            setInvitationForm({ ...invitationForm, role });
            setUrl("");
            setInviteSent(false);
            setEmailSendAttempted(false);
          }}
        />
      </Box>
      {hasInvitationLink && !inviteSent && (
        <InviteUrl url={url} emailSendAttempted={emailSendAttempted} />
      )}
    </Dialog>
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

function checkValidEmail(email: string) {
  return EmailValidator.validate(email);
}