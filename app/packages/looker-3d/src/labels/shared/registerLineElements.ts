import { extend } from "@react-three/fiber";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";

// Registers the three.js "fat lines" JSX intrinsics (<lineSegments2>, etc.)
// once, as a module-level side effect, so both the standalone cuboid path
// and the instanced-batch outline can import this instead of each calling
// extend() again.
extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });
