import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { EntryKind, isGeneratedView } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Sidebar from "../../../Sidebar";
import { isEditing } from "./Edit";
import GroupEntry from "./GroupEntry";
import LabelEntry from "./LabelEntry";
import LoadingEntry from "./LoadingEntry";
import PrimitiveEntry from "./PrimitiveEntry";
import useEntries from "./useEntries";
import { usePrimitivesCount } from "./usePrimitivesCount";
import { useSchemaManagerModal } from "./SchemaManager/hooks";
import useCanManageSchema from "./useCanManageSchema";

const EmptyLabelsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1rem;
  gap: 0.5rem;
`;

export default function AnnotateSidebar() {
  usePrimitivesCount();
  const isEditingValue = useAtomValue(isEditing);
  const isGenerated = useRecoilValue(isGeneratedView);
  const { openSchemaManager } = useSchemaManagerModal();
  const canManage = useCanManageSchema();

  // Don't show label list in edit mode or in generated views (patches/clips/frames)
  // In generated views, only the edit panel should be visible
  if (isEditingValue || isGenerated) return null;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginInline: "1rem",
          paddingBottom: "0.5rem",
        }}
      >
        <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
          Click labels to edit
        </Text>
        {canManage && (
          <Button
            variant={Variant.Borderless}
            size={Size.Sm}
            onClick={openSchemaManager}
          >
            Schema
          </Button>
        )}
      </div>
      <Sidebar
        isDisabled={() => true}
        render={(_key, _group, entry) => {
          if (entry.kind === EntryKind.GROUP) {
            return { children: <GroupEntry name={entry.name} /> };
          }

          if (entry.kind === EntryKind.LABEL) {
            const { kind: _kind, atom } = entry;
            return {
              children: <LabelEntry atom={atom} />,
              disabled: true,
            };
          }

          if (entry.kind === EntryKind.EMPTY_ANNOTATIONS) {
            return {
              children: (
                <EmptyLabelsContainer>
                  <Text variant={TextVariant.Lg}>No labels to annotate</Text>
                  <Text
                    color={TextColor.Secondary}
                    variant={TextVariant.Md}
                    style={{ textAlign: "center" }}
                  >
                    Check that your fields are enabled on Explore.
                  </Text>
                </EmptyLabelsContainer>
              ),
              disabled: true,
            };
          }

          if (entry.kind === EntryKind.LOADING) {
            return {
              children: <LoadingEntry />,
              disabled: true,
            };
          }

          if (entry.kind === EntryKind.PATH) {
            return {
              children: <PrimitiveEntry path={entry.path} />,
              disabled: false,
            };
          }

          throw new Error("unexpected");
        }}
        useEntries={useEntries}
        modal={true}
      />
    </>
  );
}
