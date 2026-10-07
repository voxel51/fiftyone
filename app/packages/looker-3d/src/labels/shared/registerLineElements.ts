import {
  extend,
  type BufferGeometryNode,
  type MaterialNode,
  type Object3DNode,
} from "@react-three/fiber";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";

// Registers the three.js "fat lines" JSX intrinsics (<lineSegments2>, etc.)
// once, as a module-level side effect, so both the standalone cuboid path
// and the instanced-batch outline can import this instead of each calling
// extend() again.
extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

declare module "@react-three/fiber" {
  interface ThreeElements {
    lineSegments2: Object3DNode<LineSegments2, typeof LineSegments2>;
    lineMaterial: MaterialNode<LineMaterial, typeof LineMaterial>;
    lineSegmentsGeometry: BufferGeometryNode<
      LineSegmentsGeometry,
      typeof LineSegmentsGeometry
    >;
  }
}
