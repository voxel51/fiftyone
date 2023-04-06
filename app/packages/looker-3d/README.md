# looker-3d

**A 3d visualizer plugin for fiftyone.**

Here's a description of the basic inner workings.

```jsx
<Canvas>
  <Scene>
     <PointCloud location={[0, 0, 0]} rotation={
     <Cube location={[x, y, z]} dimensions={[sizeX, sizeY, sizeZ]}  />
     <Line points={[vecA, vecB]} />
     <mesh id="a" location={[x2, y2, z2]}>
        <mesh id="b" location=[{1, 1, 1,}] />
     </mesh>
     <Camera location={defaultCameraPosition} />
  </Scene>
</Canvas>
```

**Canvas**

The canvas has its own coordinate space, which you can consider "screen space" - relative to the browser window. Eg. `[0, 0]` is the top left (2d, up=-y, down=y, left=-x, right=x). This is the coordinate space that the tooltips are rendered in.

**Scene**

This is the coordinate space that all objects are located in. [0, 0, 0] is the scene "origin". Each object in the scene has its own "origin". Eg. `mesh id=b` is positioned at `(mesh id=a).location + (mesh id=b).location`.

The scene is oriented with `z = up`. You can conceptually think of x as left/right and y as near/far/depth, but that is only if your reference point (eg. camera) is at something like `[0, -1, 1]` and your looking at `scene [0, 0, 0]`. As soon as you move the camera, you can only consider camera space coordinates to map to any "named" dimensions (left/right, up/down, etc). Thats why you first need to say in which of these coordinate spaces you are describing and for labels, they are all in scene space and not camera space.

**Camera**

As the user interacts with the camera (drag) the camera is moving around the scene. An example of camera coordinates would be a `lookAt` vector. This vector would be relative to the cameras position, that way if the camera is moved it still has the same rotation. Another example (outside our scope) is camera coordinates in shaders, which can be used for things like generating depth passes.

Also note that the camera's lookAt vector is calculated using a target. Where `lookAt` is in camera coordinates, the `target` vector is in `Scene` coordinates, which is: `[0,0,0]`. This means that regardless of the `defaultCameraPosition` the camera will point at the target in the scene (which is the origin of the scene). This is not configurable at the moment.

**Cube**

Like any other object, the Cube is positioned within the `Scene` coordinates. It has one unique attribute "itemRotation" which works like this: `actualRotation = rotation.add(itemRotation)`. Right now the `y` coordinate of this position is actually based on the dimensions of the cube. This is very likely just a bug leftover from supporting the kitti format/dataset. I would like to remove this quirk and position the cube at the given scene coordinate.

**Line**

Note: `Line` does not currently support `itemRotation`.
