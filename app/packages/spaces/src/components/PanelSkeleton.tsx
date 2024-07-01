import { CenteredStack } from "@fiftyone/components";
import { Skeleton } from "@mui/material";
import { StyledPanel } from "./StyledElements";

export default function PanelSkeleton() {
  return (
    <StyledPanel>
      <CenteredStack>
        <Skeleton height={64} width="80%" />
        <Skeleton height={64} width="80%" />
        <Skeleton height={64} width="80%" />
      </CenteredStack>
    </StyledPanel>
  );
}
