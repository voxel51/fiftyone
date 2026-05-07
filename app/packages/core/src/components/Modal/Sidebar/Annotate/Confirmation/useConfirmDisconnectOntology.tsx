import { Typography } from "@mui/material";
import {
  Button,
  Orientation,
  Size,
  Spacing,
  Stack,
  Variant,
} from "@voxel51/voodo";
import { atom, useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import Modal from "./Modal";

const showDisconnectConfirmation = atom(false);

function DisconnectOntologyModalComponent({
  onConfirm,
}: {
  onConfirm: () => void;
}) {
  const [shown, show] = useAtom(showDisconnectConfirmation);

  const close = () => show(false);

  return shown ? (
    <Modal close={close} title="Are you sure?">
      <Typography color="secondary" padding="1rem 0">
        Disconnecting this Ontology will result in the following removed from
        the schema:
      </Typography>

      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Md}
        style={{ paddingTop: "1rem", justifyContent: "end" }}
      >
        <Button size={Size.Md} variant={Variant.Secondary} onClick={close}>
          Never mind
        </Button>
        <Button
          size={Size.Md}
          variant={Variant.Primary}
          onClick={() => {
            onConfirm();
            close();
          }}
        >
          Confirm
        </Button>
      </Stack>
    </Modal>
  ) : null;
}

export const useConfirmDisconnectOntology = (onConfirm: () => void) => {
  const showConfirmation = useSetAtom(showDisconnectConfirmation);
  return {
    confirmDisconnect: useCallback(
      () => showConfirmation(true),
      [showConfirmation]
    ),
    DisconnectOntologyModal: () => (
      <DisconnectOntologyModalComponent onConfirm={onConfirm} />
    ),
  };
};
