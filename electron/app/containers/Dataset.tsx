import React, { useState, useEffect } from "react";
import { Switch, Route, Redirect, useRouteMatch } from "react-router-dom";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { Container, Message, Segment } from "semantic-ui-react";

import SamplesContainer from "./SamplesContainer";
import Distributions from "../components/Distributions";
import HorizontalNav from "../components/HorizontalNav";
import SampleModal from "../components/SampleModal";
import { ModalWrapper, Overlay } from "../components/utils";
import routes from "../constants/routes.json";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import connect from "../utils/connect";
import { VALID_LABEL_TYPES } from "../utils/labels";

function NoDataset() {
  return (
    <Segment>
      <Message>No dataset loaded</Message>
    </Segment>
  );
}

function Dataset(props) {
  const { path, url } = useRouteMatch();
  const { connected, loading, port, state, displayProps } = props;
  const hasDataset = Boolean(state && state.dataset);
  const tabs = [routes.SAMPLES, routes.TAGS, routes.LABELS, routes.SCALARS];
  const [modal, setModal] = useState({
    visible: false,
    sample: null,
    activeLabels: {},
  });
  const colorMap = useRecoilValue(atoms.colorMap);
  const refreshColorMap = useSetRecoilState(selectors.refreshColorMap);

  const datasetName = useRecoilValue(selectors.datasetName);
  const currentSamples = useRecoilValue(atoms.currentSamples);
  const labelNames = useRecoilValue(selectors.labelNames);
  const tagNames = useRecoilValue(selectors.tagNames);
  const labelTypes = useRecoilValue(selectors.labelTypes);
  const fieldSchema = useRecoilValue(selectors.fieldSchema);

  // update color map
  useEffect(() => {
    refreshColorMap(colorMap);
  }, [labelNames, tagNames]);

  // select any new labels by default
  useEffect(() => {
    const newSelection = { ...displayProps.activeLabels };
    for (const label of labelNames) {
      if (
        newSelection[label] === undefined &&
        VALID_LABEL_TYPES.includes(labelTypes[label])
      ) {
        newSelection[label] = true;
      }
    }
    displayProps.setActiveLabels(newSelection);
  }, [datasetName, labelNames]);

  const handleHideModal = () => setModal({ visible: false, sample: null });
  useEffect(() => {
    document.body.classList.toggle("noscroll", modal.visible);

    setModal({
      ...modal,
      activeLabels: modal.visible
        ? {
            ...displayProps.activeLabels,
            ...displayProps.activeOther,
          }
        : {},
    });
  }, [modal.visible]);

  let src = null;
  let s = null;
  if (modal.sample) {
    const path = modal.sample.filepath;
    const id = modal.sample._id.$oid;
    const host = `http://127.0.0.1:${port}/`;
    src = `${host}?path=${path}&id=${id}`;
    s = modal.sample;
  }
  if (loading) {
    return <Redirect to={routes.LOADING} />;
  }

  if (!connected) {
    return <Redirect to={routes.SETUP} />;
  }

  let modalProps = {};
  if (modal.visible && modal.sample) {
    const currentSampleIndex = currentSamples.findIndex(
      (sample) => sample._id.$oid == modal.sample._id.$oid
    );
    const previousSample = currentSamples[currentSampleIndex - 1];
    if (previousSample) {
      modalProps.onPrevious = () =>
        setModal({ ...modal, sample: previousSample });
    }
    const nextSample = currentSamples[currentSampleIndex + 1];
    if (nextSample) {
      modalProps.onNext = () => setModal({ ...modal, sample: nextSample });
    }
  }

  return (
    <>
      {modal.visible ? (
        <ModalWrapper>
          <Overlay onClick={handleHideModal} />
          <SampleModal
            activeLabels={modal.activeLabels}
            fieldSchema={fieldSchema}
            colorMap={colorMap}
            sample={modal.sample}
            sampleUrl={src}
            onClose={handleHideModal}
            {...modalProps}
          />
        </ModalWrapper>
      ) : null}
      <Container fluid={true}>
        <HorizontalNav
          currentPath={props.location.pathname}
          entries={tabs.map((path) => ({ path, name: path.slice(1) }))}
        />
        <Switch>
          <Route exact path={routes.DATASET}>
            <Redirect to={routes.SAMPLES} />
          </Route>
          {hasDataset ? (
            <>
              <Route path={routes.SAMPLES}>
                <SamplesContainer
                  {...props.socket}
                  setView={(sample) =>
                    setModal({
                      ...modal,
                      visible: true,
                      sample,
                    })
                  }
                  displayProps={displayProps}
                  colorMap={colorMap}
                />
              </Route>
              <Route path={routes.LABELS}>
                <Distributions group="labels" />
              </Route>
              <Route path={routes.TAGS}>
                <Distributions group="tags" />
              </Route>
              <Route path={routes.SCALARS}>
                <Distributions group="scalars" />
              </Route>
            </>
          ) : (
            <NoDataset />
          )}
        </Switch>
      </Container>
    </>
  );
}

export default connect(Dataset);
