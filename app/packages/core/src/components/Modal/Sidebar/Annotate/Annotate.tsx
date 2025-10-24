import { LoadingSpinner } from "@fiftyone/components";
import { lighterSceneAtom } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { EntryKind } from "@fiftyone/state";
import { isAnnotationSupported } from "@fiftyone/utilities";
import { Typography } from "@mui/material";
import { atom, useAtomValue } from "jotai";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Sidebar from "../../../Sidebar";
import Actions from "./Actions";
import Edit, { isEditing } from "./Edit";
import GroupEntry from "./GroupEntry";
import ImportSchema from "./ImportSchema";
import LabelEntry from "./LabelEntry";
import LoadingEntry from "./LoadingEntry";
import SchemaManager from "./SchemaManager";
import { activePaths, schemas, showModal } from "./state";
import useEntries from "./useEntries";
import useLabels from "./useLabels";

const showImportPage = atom((get) => !get(activePaths).length);

const Container = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  overflow: auto;
`;

const Loading = () => {
  return (
    <Container>
      <LoadingSpinner />
      <Typography color="secondary" padding="1rem 0">
        Loading
      </Typography>
    </Container>
  );
};

const AnnotateSidebar = () => {
  useLabels();
  const editing = useAtomValue(isEditing);

  if (editing) return null;

  return (
    <>
      <Actions />
      <Sidebar
        isDisabled={() => true}
        render={(key, group, entry) => {
          if (entry.kind === EntryKind.GROUP) {
            return { children: <GroupEntry name={entry.name} /> };
          }

          if (entry.kind === EntryKind.LABEL) {
            const { kind: _, atom } = entry;
            return {
              children: <LabelEntry atom={atom} />,
              disabled: true,
            };
          }

          if (entry.kind === EntryKind.LOADING) {
            return {
              children: <LoadingEntry />,
              disabled: true,
            };
          }

          throw new Error("unexpected");
        }}
        useEntries={useEntries}
      />
    </>
  );
};

const Annotate = () => {
  const showSchemaModal = useAtomValue(showModal);
  const showImport = useAtomValue(showImportPage);
  const loading = useAtomValue(schemas) === null;
  const editing = useAtomValue(isEditing);
  const scene = useAtomValue(lighterSceneAtom);

  const mediaType = useRecoilValue(fos.mediaType);
  const annotationSupported = isAnnotationSupported(mediaType);

  if (annotationSupported && (loading || !scene)) {
    return <Loading />;
  }

  return (
    <>
      {editing && <Edit key="edit" />}
      {showImport ? (
        <ImportSchema key="import" disabled={!annotationSupported} />
      ) : (
        <AnnotateSidebar key="annotate" />
      )}
      {showSchemaModal && <SchemaManager key="manage" />}
    </>
  );
};

export default Annotate;
