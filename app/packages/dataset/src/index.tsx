import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot } from "recoil";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";
import { Dataset, getEnvProps } from "./";

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
  const [settings, setSettings] = React.useState({
    dataset: "quickstart",
    readOnly: false,
  });
  return (
    <>
      <DatasetSettings current={settings} onChange={setSettings} />
      <div style={{ height: "100vh", overflow: "hidden" }}>
        <Dataset datasetName={settings.dataset} readOnly={settings.readOnly} />
      </div>
    </>
  );
}

function DatasetSettings({ current, onChange }) {
  const datasetInputRef = useRef();
  const readOnlyInputRef = useRef();
  function load(e) {
    e.preventDefault();
    const dataset = datasetInputRef.current
      ? datasetInputRef.current.value
      : null;
    const readOnly = readOnlyInputRef.current
      ? readOnlyInputRef.current.checked
      : false;
    onChange((s) => ({ ...s, dataset, readOnly }));
  }
  return (
    <form onSubmit={load}>
      <input
        ref={readOnlyInputRef}
        type="checkbox"
        defaultChecked={current.readOnly}
      />{" "}
      Read Only
      <input ref={datasetInputRef} type="text" defaultValue={current.dataset} />
      <button type="submit">load</button>
    </form>
  );
}

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <DatasetWrapper />
);
