import { Line2 } from "three/examples/jsm/lines/Line2";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { ReactThreeFiber } from "@react-three/fiber";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      lineSegments2: ReactThreeFiber.Node<LineSegments2, typeof LineSegments2>;
      lineSegmentsGeometry: ReactThreeFiber.Node<
        LineSegmentsGeometry,
        typeof LineSegmentsGeometry
      >;
      line2: ReactThreeFiber.Node<Line2, typeof Line2>;
      lineGeometry: ReactThreeFiber.Node<LineGeometry, typeof LineGeometry>;
      lineMaterial: ReactThreeFiber.Node<LineMaterial, typeof LineMaterial>;
    }
  }
}
