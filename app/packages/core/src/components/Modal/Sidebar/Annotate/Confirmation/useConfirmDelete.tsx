import { MuiButton } from "@fiftyone/components";
import { Typography } from "@mui/material";
import React, { useCallback } from "react";
import { useDispatch } from "react-redux";
import styled from "styled-components";
import { CheckboxView } from "../../../../../plugins/SchemaIO/components";
import { useCurrentType } from "../redux/hooks";
import {
  setAskForDeleteConfirmation,
  setShowDeleteConfirmation,
} from "../redux/annotationSlice";
import { useAnnotationSelector } from "../redux/hooks";
import Modal from "./Modal";

const Row = styled.div`
  padding-top: 1rem;
  display: flex;
  justify-content: space-between;
`;

function DeleteModal({ deleteAnnotation }: { deleteAnnotation: () => void }) {
  const shown = useAnnotationSelector(
    (s) => s.annotation.showDeleteConfirmation
  );
  const type = useCurrentType();
  const askAgain = useAnnotationSelector(
    (s) => s.annotation.askForDeleteConfirmation
  );
  const dispatch = useDispatch();

  const close = useCallback(
    () => dispatch(setShowDeleteConfirmation(false)),
    [dispatch]
  );

  return shown ? (
    <Modal close={close} title={`Delete this ${type?.toLowerCase()}?`}>
      <Typography color="secondary" padding="1rem 0">
        This will delete the label and its attributes. The action is permanent
        and cannot be reversed.
      </Typography>

      <CheckboxView
        data={!askAgain}
        onChange={(_, checked) =>
          dispatch(setAskForDeleteConfirmation(!checked))
        }
        schema={{ view: { label: "Don't ask me again" } }}
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
  const askForConfirmation = useAnnotationSelector(
    (s) => s.annotation.askForDeleteConfirmation
  );
  const dispatch = useDispatch();

  return {
    confirmDelete: useCallback(() => {
      if (askForConfirmation) {
        dispatch(setShowDeleteConfirmation(true));
        return;
      }
      deleteAnnotation();
    }, [askForConfirmation, deleteAnnotation, dispatch]),

    DeleteConfirmationModal: useCallback(
      () => <DeleteModal deleteAnnotation={deleteAnnotation} />,
      [deleteAnnotation]
    ),
  };
};
