import { PillButton } from "@fiftyone/components";
import {
  useOperatorBrowser,
  usePromptOperatorInput,
} from "@fiftyone/operators";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { useMemo } from "react";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";

const IMPORT_SAMPLES_OPERATOR = "@voxel51/io/import_samples";

export default ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const promptForInput = usePromptOperatorInput();
  const browser = useOperatorBrowser();

  const hasImportSamplesOperator = useMemo(() => {
    return Array.isArray(browser.choices)
      ? browser.choices.some(
          (choice) => choice?.value === IMPORT_SAMPLES_OPERATOR,
        )
      : false;
  }, [browser]);

  if (!hasImportSamplesOperator) return null;

  return (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <PillButton
        icon={<FileUploadIcon />}
        onClick={() => {
          promptForInput(IMPORT_SAMPLES_OPERATOR);
          adaptiveMenuItemProps?.closeOverflow?.();
        }}
        title="Import"
        tooltipPlacement={modal ? "bottom" : "top"}
        data-cy="action-import"
      />
    </ActionDiv>
  );
};
