import { PopoverButton } from "@fiftyone/teams-components";
import { cloneViewForceClosePopoverCount } from "@fiftyone/teams-state";
import { ContentCopy } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useRecoilValue } from "recoil";
import CloneViewBody from "./CloneViewBody";

export default function CloneView() {
  const count = useRecoilValue(cloneViewForceClosePopoverCount);
  return (
    <PopoverButton
      PopoverButtonBody={() => (
        <Typography color="text.primary" data-cy="clone-button">
          Clone
        </Typography>
      )}
      popoverButtonProps={{
        variant: undefined,
        sx: { mr: 2 },
        startIcon: (
          <ContentCopy
            fontSize="inherit"
            sx={{ fontSize: "16px!important", ml: 0.5 }}
          />
        ),
      }}
      PopoverBody={CloneViewBody}
      forceCloseCount={count}
    />
  );
}
