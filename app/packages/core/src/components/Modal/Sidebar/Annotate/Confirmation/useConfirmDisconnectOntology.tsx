import { Typography } from "@mui/material";
import {
  Button,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { atom, useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import Modal from "./Modal";

const showDisconnectConfirmation = atom(false);

function DisconnectOntologyModalComponent({
  onConfirm,
  vulnerableAttributes,
}: {
  onConfirm: () => void;
  vulnerableAttributes: string[];
}) {
  const [shown, show] = useAtom(showDisconnectConfirmation);

  const close = () => show(false);

  return shown ? (
    <Modal close={close} title="Are you sure?">
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.Lg}
        style={{ paddingTop: "1rem" }}
      >
        <Typography color="secondary">
          Disconnecting this ontology will remove the following attributes from
          the schema:
        </Typography>

        {vulnerableAttributes && vulnerableAttributes.length > 0 && (
          <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
            <Typography color={TextColor.Primary}>Attributes:</Typography>
            {vulnerableAttributes.length > 0 && (
              <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                {vulnerableAttributes.slice(0, 5).map((name) => (
                  <Text
                    key={name}
                    variant={TextVariant.Md}
                    color={TextColor.Secondary}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      paddingLeft: "1rem",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: "4px",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: "currentColor",
                        flexShrink: 0,
                      }}
                    />
                    {name}
                  </Text>
                ))}
                {vulnerableAttributes.length > 5 && (
                  <Text
                    variant={TextVariant.Md}
                    color={TextColor.Primary}
                    style={{ paddingLeft: "2rem" }}
                  >
                    ... and {vulnerableAttributes.length - 5} others
                  </Text>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </Stack>

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

export const useConfirmDisconnectOntology = (
  onConfirm: () => void,
  vulnerableAttributes: string[]
) => {
  const showConfirmation = useSetAtom(showDisconnectConfirmation);
  return {
    confirmDisconnect: useCallback(
      () => showConfirmation(true),
      [showConfirmation]
    ),
    DisconnectOntologyModal: () => (
      <DisconnectOntologyModalComponent
        onConfirm={onConfirm}
        vulnerableAttributes={vulnerableAttributes}
      />
    ),
  };
};
