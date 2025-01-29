import { atom, useRecoilState } from "recoil";
import { PlotlyRelayoutEvent } from "plotly.js-dist-min";
import _ from "lodash";

type PlotBounds = {
  a: [number, number];
  b: [number, number];
};

const atoms = {
  bounds: atom<PlotBounds | null>({
    key: "embeddingsPlotWindowBounds",
    default: null,
  }),
};

function convertPlotlyRelayoutEventToPlotBounds(
  relayoutEvent: PlotlyRelayoutEvent
): PlotBounds {
  return {
    a: [
      relayoutEvent["xaxis.range[0]"] as number,
      relayoutEvent["yaxis.range[0]"] as number,
    ],
    b: [
      relayoutEvent["xaxis.range[1]"] as number,
      relayoutEvent["yaxis.range[1]"] as number,
    ],
  };
}

export default function useCurrentPlotWindow() {
  const [bounds, setBounds] = useRecoilState(atoms.bounds);

  const updateBounds = _.throttle((relayoutEvent: PlotlyRelayoutEvent) => {
    if (
      relayoutEvent.hasOwnProperty("xaxis.range[0]") &&
      relayoutEvent.hasOwnProperty("xaxis.range[1]") &&
      relayoutEvent.hasOwnProperty("yaxis.range[0]") &&
      relayoutEvent.hasOwnProperty("yaxis.range[1]")
    ) {
      console.log("updating bounds", relayoutEvent);
      setBounds(convertPlotlyRelayoutEventToPlotBounds(relayoutEvent));
    }
  }, 100);

  const resetBounds = () => {
    setBounds(null);
  };

  return {
    bounds,
    updateBounds,
    resetBounds,
  };
}
