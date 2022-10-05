import { Theme } from "@fiftyone/components";
import { darkTheme, getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { Fragment, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot, useRecoilValue } from "recoil";
import { Dataset, getEnvProps } from "./";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";

// import "./index.css";

//
// NOTE: this represents a "mock" environment that the Dataset
// component is embedded in. It is also used as a reference
// for the contract the embedding application must adhere to
//
const DatasetWrapper = () => {
  // @ts-ignore
  const props = getEnvProps();

  // @ts-ignore
  return (
    <RecoilRoot>
      <RecoilRelayEnvironmentProvider {...props}>
        <LoadableDataset />
      </RecoilRelayEnvironmentProvider>
    </RecoilRoot>
  );
};

function LoadableDataset() {
  const [datasetName, setDatasetName] = React.useState("quickstart");
  return (
    <Fragment>
      <DatasetSelector current={datasetName} onChange={setDatasetName} />
      <div style={{ height: "100vh", overflow: "hidden" }}>
        <Dataset datasetName={datasetName} />
      </div>
    </Fragment>
  );
}

function DatasetSelector({ current, onChange }) {
  const ref = useRef();
  function load(e) {
    e.preventDefault();
    if (ref.current && ref.current.value) {
      onChange(ref.current.value);
    }
  }
  return (
    <form onSubmit={load}>
      <input ref={ref} type="text" defaultValue={current} />
      <button type="submit">load</button>
    </form>
  );
}

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <DatasetWrapper />
);
