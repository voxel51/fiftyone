import { MuiButton } from "@fiftyone/components";
import { Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import React, { useCallback } from "react";
import styled from "styled-components";
import { CheckboxView } from "../../../../../plugins/SchemaIO/components";
import { currentType } from "../Edit/state";
import Modal from "./Modal";

const showDeleteConfirmation = atom(false);

const askForDeleteConfirmation = atomWithStorage(
  "HA.askForDeleteConfirmation",
  true
);

const Row = styled.div`
  padding-top: 1rem;
  display: flex;
  justify-content: space-between;
`;

function DeleteModal({ deleteAnnotation }: { deleteAnnotation: () => void }) {
  const [shown, show] = useAtom(showDeleteConfirmation);
  const type = useAtomValue(currentType);
  const [askAgain, setAskAgain] = useAtom(askForDeleteConfirmation);

  return shown ? (
    <Modal close={() => show(false)} title={`Delete this ${type}?`}>
      <Typography color="secondary" padding="1rem 0">
        This will delete the label and its attributes. The action is permanent
        and cannot be reversed.
      </Typography>

      <CheckboxView
        data={!askAgain}
        onChange={(_, checked) => setAskAgain(!checked)}
        schema={{ view: { label: "Dont't ask me again" } }}
      />

      <Row>
        <MuiButton color="secondary" onClick={close} variant="outlined">
          Cancel
        </MuiButton>
        <MuiButton
          color="error"
          onClick={() => {
            deleteAnnotation();
            close();
          }}
          variant="contained"
        >
          Delete label
        </MuiButton>
      </Row>
    </Modal>
  ) : null;
}

export const useConfirmDelete = (deleteAnnotation: () => void) => {
  const askForConfirmation = useAtomValue(askForDeleteConfirmation);
  const showConfirmation = useSetAtom(showDeleteConfirmation);
  return {
    confirmDelete: useCallback(() => {
      if (askForConfirmation) {
        showConfirmation(true);
        return;
      }

      deleteAnnotation();
    }, [askForConfirmation, deleteAnnotation, showConfirmation]),
    DeleteModal: () => <DeleteModal deleteAnnotation={deleteAnnotation} />,
  };
};
