import { Close, Warning } from "@mui/icons-material";
import {
  WarningsContainer,
  WarningClose,
  WarningItem,
} from "./styled-components";
import { useWarnings } from "./useWarnings";

export function Warnings() {
  const warnings = useWarnings();
  if (!warnings.visible) return null;

  return (
    <WarningsContainer>
      <WarningClose>
        <Close onClick={warnings.hide} />
      </WarningClose>
      {warnings.items.map((msg) => (
        <WarningItem>
          <div>
            <Warning />
          </div>
          <div>{msg}</div>
        </WarningItem>
      ))}
    </WarningsContainer>
  );
}
