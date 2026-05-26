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
import { useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import { useAnnotationContext } from "./Edit/useAnnotationContext";
import RequiredFieldPrompt from "./RequiredFieldPrompt";
import { activeLabelSchemas } from "./state";
import useCanManageSchema from "./useCanManageSchema";
import type { RequiredField } from "./useSourceFieldToActivate";
import { useSchemaManagerModal } from "./SchemaManager/hooks";

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

export function useShowImportSchema(
  disabled: boolean,
  requiredField: RequiredField | null
): boolean {
  const noActiveSchemas = !useAtomValue(activeLabelSchemas)?.length;
  const isEditingValue = useAnnotationContext().selected.isEditing;
  return (
    noActiveSchemas || disabled || (requiredField != null && !isEditingValue)
  );
}

interface SetupPromptProps {
  disabled?: boolean;
  canManage: boolean;
  onAddSchema: () => void;
}

const SetupPrompt = ({
  disabled,
  canManage,
  onAddSchema,
}: SetupPromptProps) => (
  <>
    <Text variant={TextVariant.Xl} style={{ textAlign: "center" }}>
      Annotate faster than ever
    </Text>
    <Text
      color={TextColor.Secondary}
      variant={TextVariant.Md}
      style={{ textAlign: "center" }}
    >
      Import your dataset schema to access and edit labels, set up attributes,
      and start annotating right away.
    </Text>
    <Button
      variant={Variant.Primary}
      data-cy="open-schema-manager"
      disabled={disabled || !canManage}
      onClick={onAddSchema}
    >
      Add schema
    </Button>
  </>
);

export interface ImportSchemaProps {
  disabled?: boolean;
  disabledMsg?: React.ReactNode;
  requiredField?: RequiredField | null;
}

const ImportSchema = (
  { disabled, disabledMsg, requiredField }: ImportSchemaProps = {
    disabled: false,
  }
) => {
  const canManage = useCanManageSchema();
  const { openSchemaManager } = useSchemaManagerModal();

  const showRequiredFieldPrompt = requiredField != null && !disabled;

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
          <MuiIconFont
            sx={{
              fontSize: 48,
              color: "var(--color-brand-accent)",
            }}
            name="draw"
          />

          {showRequiredFieldPrompt ? (
            <RequiredFieldPrompt requiredField={requiredField!} />
          ) : (
            <SetupPrompt
              disabled={disabled}
              canManage={canManage}
              onAddSchema={openSchemaManager}
            />
          )}
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
      )}
    </Container>
  );
};

export default ImportSchema;
