import { Button } from "@fiftyone/components";
import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { AnnotationLabel } from "@fiftyone/state";
import { DeleteOutline } from "@mui/icons-material";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import ioSchema from "../../../../../plugins/SchemaIO/examples/input.json";
import { Redo, RoundButton, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import { fieldType, schemaConfig } from "../state";
import { current, editing } from "./state";
import useMove from "./useMove";

const Row = styled.div`
  align-items: center;
  color: ${({ theme }) => theme.text.secondary};
  display: flex;
  justify-content: space-between;
  margin: 0.5rem -1rem;
  padding: 0 0.5rem;
`;

const ContentContainer = styled.div`
  margin: 0.25rem 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const Content = styled.div`
  background: ${({ theme }) => theme.neutral.softBg};
  border-radius: 3px;
  width: 100%;
  flex: 1;
  padding: 1rem;
  overflow: auto;
`;

const Header = ({ type, label }: { type: string; label: AnnotationLabel }) => {
  const Icon = type ? ICONS[type] ?? ICONS : null;

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Icon fill="white" />
        <div>{label.path}</div>
      </ItemLeft>
      <ItemRight>
        <Undo />
        <Redo />
      </ItemRight>
    </Row>
  );
};

const Footer = () => {
  const setEditingAtom = useSetAtom(editing);
  const { scene } = useLighter();
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentLabel = useAtomValue(current);

  return (
    <Row>
      <RoundButton
        onClick={() => {
          if (!currentLabel) return;

          if (!scene) return;

          scene.removeOverlay(currentLabel.id);

          scene.dispatchSafely({
            type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
            detail: {
              id: currentLabel.id,
              sampleId: currentSampleId,
              path: currentLabel.expandedPath,
            },
          });

          setEditingAtom(null);
        }}
      >
        {currentLabel && <DeleteOutline />}
        Delete
      </RoundButton>

      <Button onClick={() => setEditingAtom(null)}>Done</Button>
    </Row>
  );
};

export default function Edit() {
  const [label] = useAtom(current);

  const type = useMemo(() => {
    if (!label) {
      return null;
    }
    const store = getDefaultStore();
    return store.get(fieldType(label.path));
  }, [label]);

  const config = useMemo(() => {
    if (!label) {
      return null;
    }

    const store = getDefaultStore();
    return store.get(schemaConfig(label.path));
  }, [label]);

  useMove();

  if (!label || !type || !config) {
    return null;
  }

  return (
    <ContentContainer>
      <Header type={type} label={label} />
      <Content>
        <SchemaIOComponent
          schema={ioSchema}
          data={{ X: 1 }}
          onChange={(...args) => {
            console.log(args);
          }}
        />
      </Content>
      <Footer />
    </ContentContainer>
  );
}
