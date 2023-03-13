import { useBeforeScreenshot } from "@fiftyone/state";
import { useThree } from "@react-three/fiber";

export const Screenshot = () => {
  const { gl, scene, camera } = useThree();

  useBeforeScreenshot(() => {
    return new Promise((resolve) => {
      gl.render(scene, camera);
      resolve(gl.domElement);
    });
  });

  return null;
};
