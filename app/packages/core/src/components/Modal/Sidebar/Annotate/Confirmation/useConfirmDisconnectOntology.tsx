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
import { useCallback, useMemo } from "react";
import Modal from "./Modal";

const displayCount = 5;
const showDisconnectConfirmation = atom(false);

function DisconnectOntologyModalComponent({
  onConfirm,
  affectedAttributes,
}: {
  onConfirm: () => void;
  affectedAttributes: string[];
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

        {affectedAttributes && affectedAttributes.length > 0 && (
          <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
            <Typography color={TextColor.Primary}>Attributes:</Typography>
            {affectedAttributes.length > 0 && (
              <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                {affectedAttributes.slice(0, displayCount).map((name) => (
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
                {affectedAttributes.length > displayCount && (
                  <Text
                    variant={TextVariant.Md}
                    color={TextColor.Primary}
                    style={{ paddingLeft: "2rem" }}
                  >
                    ... and {affectedAttributes.length - displayCount} others
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
  affectedAttributes: string[]
) => {
  const showConfirmation = useSetAtom(showDisconnectConfirmation);

  const confirmDisconnect = useCallback(
    () => showConfirmation(true),
    [showConfirmation]
  );

  const DisconnectOntologyModal = useCallback(
    () => (
      <DisconnectOntologyModalComponent
        onConfirm={onConfirm}
        affectedAttributes={affectedAttributes}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onConfirm, affectedAttributes]
  );

  return { confirmDisconnect, DisconnectOntologyModal };
};
