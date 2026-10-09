import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { setDefaultGridPanel } from "@fiftyone/state";
import { type CSSProperties, useMemo } from "react";
import styled from "styled-components";
import Grid from "./Grid";
import Header from "./Grid/Header";
import { createRelayoutDemo, RelayoutDemoContext } from "./Grid/relayoutDemo";

const Container = styled.div`
  position: relative;
  padding: 0;
  height: 100%;
  overflow-y: hidden;
`;

// PanelIcon's box is taller than the icon; center it rather than leaving a
// bare inline svg on the text baseline.
const FloodlightIcon = ({ style }: { style?: CSSProperties }) => (
  <span style={{ display: "flex", alignItems: "center", height: "100%" }}>
    <svg viewBox="0 0 18 18" fill="currentColor" style={style} aria-hidden>
      <path d="M1.2 3.1 5.4 1l1.9 3.7-4.2 2.1z" />
      <path
        d="M3.4.4 4.3 2.2"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
      />
      <path d="M7.3 4.7 3.1 6.8 8.6 17.2h8.6v-8z" opacity={0.28} />
      <rect x={9.6} y={10.6} width={3} height={3} rx={0.6} />
      <rect x={13.6} y={10.6} width={3} height={3} rx={0.6} />
      <rect x={9.6} y={14.2} width={3} height={3} rx={0.6} />
      <rect x={13.6} y={14.2} width={3} height={3} rx={0.6} />
    </svg>
  </span>
);

// one demo channel per panel, so duplicate panels answer their own header
const FloodlightPanel = () => {
  const demo = useMemo(createRelayoutDemo, []);
  return (
    <RelayoutDemoContext.Provider value={demo}>
      <Container>
        <Grid key={"grid"} />
        <Header key={"header"} />
      </Container>
    </RelayoutDemoContext.Provider>
  );
};

setDefaultGridPanel("Floodlight");

registerComponent({
  name: "Floodlight",
  label: "Floodlight",
  component: FloodlightPanel,
  type: PluginComponentType.Panel,
  Icon: FloodlightIcon,
  activator: () => true,
  panelOptions: { allowDuplicates: true },
});
