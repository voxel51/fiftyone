import { Box, CodeTabs } from "@fiftyone/teams-components";

import { INVITE_URL_HELPER_TEXT } from "@fiftyone/teams-state/src/constants";

const InviteUrl = ({
  url,
  emailSendAttempted,
}: {
  url: string;
  emailSendAttempted: boolean;
}) => {
  const emailErrorDesc = emailSendAttempted
    ? "Unable to send invite due to improperly configured email client."
    : "Email client not configured.";
  return (
    <Box>
      <CodeTabs
        description={`${emailErrorDesc} \n${INVITE_URL_HELPER_TEXT}`}
        tabs={[
          {
            id: "invitee-url",
            label: "Invitee URL",
            code: url,
            customStyle: { height: "4rem", overflow: "auto" },
          },
        ]}
      />
    </Box>
  );
};

export default InviteUrl;
