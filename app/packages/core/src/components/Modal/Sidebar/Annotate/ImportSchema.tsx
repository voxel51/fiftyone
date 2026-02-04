import { MuiIconFont } from "@fiftyone/components";
import {
  Button,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import styled from "styled-components";
import useCanManageSchema from "./useCanManageSchema";
import useShowModal from "./useShowModal";

const DISABLED_DEFAULT =
  "Annotation is not yet supported for this type of media or view.";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
`;

const ContentWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const AlertWrapper = styled.div`
  display: flex;
  justify-content: center;
  padding-bottom: 0.5rem;
`;

const AlertBox = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--color-content-bg-muted);
  border-radius: var(--radius-sm);
  box-shadow: 0px 1px 2px 0px rgba(16, 24, 40, 0.05);
`;

export interface ImportSchemaProps {
  disabled?: boolean;
  disabledMsg?: React.ReactNode;
}

const ImportSchema = (
  { disabled, disabledMsg }: ImportSchemaProps = {
    disabled: false,
  }
) => {
  const canManage = useCanManageSchema();
  const showModal = useShowModal();

  const alertMessage = disabled
    ? disabledMsg || DISABLED_DEFAULT
    : !canManage
    ? "Only dataset managers can add schemas."
    : null;

  return (
    <Container>
      <ContentWrapper>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Lg}
          style={{ alignItems: "center" }}
        >
<<<<<<< HEAD
          <MuiIconFont
            sx={{
              fontSize: 48,
              color: "var(--color-brand-accent)",
            }}
            name={"draw"}
          />
          <Text variant={TextVariant.Xl} style={{ textAlign: "center" }}>
            Annotate faster than ever
          </Text>
          <Text
            color={TextColor.Secondary}
            variant={TextVariant.Md}
            style={{ textAlign: "center" }}
          >
            Import your dataset schema to access and edit labels, set up
            attributes, and start annotating right away.
          </Text>
          <Button
            variant={Variant.Primary}
            data-cy="open-schema-manager"
            disabled={disabled || !canManage}
            onClick={showModal}
          >
            Add schema
          </Button>
        </Stack>
      </ContentWrapper>
      {alertMessage && (
        <AlertWrapper>
          <AlertBox>
            <Icon name={IconName.Info} size={Size.Md} />
            <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
              {alertMessage}
            </Text>
          </AlertBox>
        </AlertWrapper>
=======
          <Typography color="secondary" fontSize={12}>
            Dataset managers can add schemas
          </Typography>
        </Alert>
      )}
      {disabled && (
        <Alert
          icon={<InfoOutlined fontSize="inherit" color="secondary" />}
          severity="info"
          sx={{
            marginTop: 2,
            background: "#333",
            boxShadow: "0px 1px 2px 0px rgba(16, 24, 40, 0.05)",
            alignItems: "center",
          }}
        >
          <Typography color="secondary" fontSize={12}>
            {disabledMsg || DISABLED_DEFAULT}
          </Typography>
        </Alert>
>>>>>>> main
      )}
    </Container>
  );
};

export default ImportSchema;
