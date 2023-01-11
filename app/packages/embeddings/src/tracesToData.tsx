import { sortStringsAlphabetically } from "./sortStringsAlphabetically";
import { getPointIndex } from "./getPointIndex";
import { Color } from "./Color";

export function tracesToData(
  traces,
  style,
  getColor,
  plotSelection,
  selectionStyle,
  colorscale
) {
  const isCategorical = style === "categorical";
  const isContinuous = style === "continuous";
  const isUncolored = style === "uncolored";
  return Object.entries(traces)
    .sort((a, b) => sortStringsAlphabetically(a[0], b[0]))
    .map(([key, trace]) => {
      // const selectedpoints = trace
      //   .map((d, idx) => (d.selected ? idx : null))
      //   .filter((d) => d !== null);
      const selectedpoints = plotSelection?.length
        ? plotSelection
            .map((id) => getPointIndex(trace, id))
            .filter((p) => p !== null)
        : null;

      // const color = Color.fromCSSRGBValues(r, g, b)
      const color = Color.fromCSSRGBValues(...getColor(key));

      console.log({ colorscale });

      const mappedColorscale = colorscale.map((c, idx) => {
        const color = Color.fromCSSRGBValues(...c);
        return [idx / (colorscale.length - 1), color.toCSSRGBString()];
      });

      console.log(mappedColorscale);

      return {
        x: trace.map((d) => d.points[0]),
        y: trace.map((d) => d.points[1]),
        ids: trace.map((d) => d.id),
        type: "scattergl",
        mode: "markers",
        marker: {
          autocolorscale: !isContinuous, // isCategorical || isUncolored,
          colorscale: mappedColorscale,
          color: isCategorical
            ? color.toCSSRGBString()
            : // ? trace.map((d) => {
            //     const selected =
            //       plotSelection?.length == 0 ||
            //       (plotSelection && (plotSelection.includes(d.id) || plotSelection.includes(d.sample_id)));
            //     if (selected) {
            //       return color.toCSSRGBString();
            //     } else {
            //       return color
            //         .setBrightness(color.getBrightness() * 0.05)
            //         .toCSSRGBString();
            //     }
            //   })
            isUncolored
            ? null
            : trace.map((d) => d.label),
          size: 6,
          colorbar:
            isCategorical || isUncolored
              ? undefined
              : {
                  lenmode: "fraction",
                  x: 1,
                  y: 0.5,
                },
        },
        name: key,
        selectedpoints,
        selected: {
          marker: {
            opacity: 1,
            size: selectionStyle === "selected" ? 10 : 6,
            color: selectionStyle === "selected" ? "orange" : undefined,
          },
        },
        unselected: {
          marker: {
            // color: color.setBrightness(0.2).toCSSRGBString(),
            opacity: 0.2,
          },
        },
      };
    });
}
