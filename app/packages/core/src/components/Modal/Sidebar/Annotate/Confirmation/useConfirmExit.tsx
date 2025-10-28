import { MuiButton } from "@fiftyone/components";
import { Typography } from "@mui/material";
import { atom, getDefaultStore, useAtom, useSetAtom } from "jotai";
import React, { useCallback } from "react";
import styled from "styled-components";
import { hasChanges } from "../Edit/state";
import Modal from "./Modal";

const showUnsavedChangesConfirmation = atom<(() => void) | false>(false);

const Row = styled.div`
  padding-top: 1rem;
  display: flex;
  justify-content: space-between;
`;

function ExitChangesModal({
  exit,
  save,
}: {
  exit: () => void;
  save: () => void;
}) {
  const [shown, show] = useAtom(showUnsavedChangesConfirmation);

  const close = useCallback(() => show(false), [show]);

  return shown ? (
    <Modal close={close} title={"You have unsaved changes"}>
      <Typography color="secondary" padding="1rem 0">
        You edited annotations for this label but haven’t saved them yet.
        Unsaved changes will be lost if you discard them.
      </Typography>

      <Row>
        <MuiButton color="secondary" onClick={close} variant="outlined">
          Cancel
        </MuiButton>

        <div style={{ display: "flex", columnGap: "0.5rem" }}>
          <MuiButton
            color="error"
            onClick={() => {
              close();
              exit();
              shown();
            }}
            variant="contained"
          >
            Discard changes
          </MuiButton>
          <MuiButton
            color="success"
            onClick={() => {
              save();
              close();
              exit();
              shown();
            }}
            variant="contained"
          >
            Save and continue
          </MuiButton>
        </div>
      </Row>
    </Modal>
  ) : null;
}

export default function useConfirmExit(
  exit: () => void,
  saveAnnotation: () => void
) {
  const showConfirmation = useSetAtom(showUnsavedChangesConfirmation);
  return {
    confirmExit: useCallback(
      (callback) => {
        if (getDefaultStore().get(hasChanges)) {
          showConfirmation(() => callback);
          return;
        }

        exit();
        callback();
      },
      [exit, showConfirmation]
    ),
    ExitChangesModal: () => (
      <ExitChangesModal exit={exit} save={saveAnnotation} />
    ),
  };
}
