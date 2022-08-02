import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

const Lasso: MapboxDraw.DrawCustomMode<{}, {}> = {
  onSetup: function () {
    const polygon = this.newFeature({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[]],
      },
    });

    this.addFeature(polygon);

    this.clearSelectedFeatures();
    this.updateUIClasses({ mouse: "add" });

    return {
      polygon,
      currentVertexPosition: 0,
    };
  },

  onClick: function (state, e) {
    var point = this.newFeature({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[[e.lngLat.lng, e.lngLat.lat]]],
      },
    });
    this.addFeature(point);
  },
  toDisplayFeatures: function (state, geojson, display) {
    display(geojson);
  },
  onTrash: function (state) {
    this.deleteFeature([state.polygon.id], { silent: true });
  },
};

export default Lasso;
