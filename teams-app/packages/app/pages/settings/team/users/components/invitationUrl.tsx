import { Box, CodeTabs } from "@fiftyone/teams-components";

import { INVITE_URL_HELPER_TEXT } from "@fiftyone/teams-state/src/constants";

const InviteUrl = ({ url }: { url: string }) => {
  return (
    <Box>
      <CodeTabs
        description={INVITE_URL_HELPER_TEXT}
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
