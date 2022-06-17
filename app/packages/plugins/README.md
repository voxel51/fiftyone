# Plugins

Develop plugins for fiftyone.


## API Proposal

This document is for working through the proposed plugin API.

It should be updated prior to merging/releasing.

### Hello World

A simple hello world plugin, that renders "hello world" in place of the `SampleModalContent` main content area, would look like this:

```jsx
import {registerComponent, PluginComponentTypes} from '@fiftyone/plugins'
import {Button} from '@fiftyone/components'

function HelloWorld() {
  return <Button>Hello World</Button>
}

registerComponent({
  copmponent: HelloWorld,
  type: PluginComponentTypes.SampleModalContent
})
```

Installing the plugin above would require building a bundle JS file and placing in a directory with a `package.json` file.

The fiftyone python server will then detect this as an installed plugin and the app will load it and render it.

### Adding a custom Fiftyone Visualizer

```jsx
import * as fop from '@fiftyone/plugins'
import * as fov from '@fiftyone/visualizer'
import { Canvas, ThreeEvent, useLoader } from '@react-three/fiber'
import {PCDLoader} from 'three/examples/jsm/loaders/PCDLoader'
import { OrbitControls } from '@react-three/drei'

// this is a example using existing react libraries
// to build a bespoke PointCloud Visualizer
function PointCloudMesh({points}) {
  return (
    <primitive object={points}>
      <pointsMaterial color={'orange'} size={0.0001} />
    </primitive>
  )
}

function PointCloud({src}) {
  const points = useLoader(PCDLoader, src)

  return (
    <Canvas>
      <PointCloudMesh points={points} />
    </Canvas>
  )
}
// end of existing react library usage

// this separate components shows where the fiftyone plugin
// dependent code ends and the pure react code begins
function CustomVisualizer({sample}) {
  const src = fov.getSampleSrc(sample.filepath)
  // now that we have all the data we need
  // we can delegate to code that doesn't depend
  // on the fiftyone plugin api
  return <PointCloud src={src} />
}

fop.registerComponent({
  // component to delegate to
  copmponent: CustomVisualizer,
  // tell fiftyone you want to provide a Visualizer
  type: PluginComponentTypes.Visualizer,
  // activate this plugin when the mediaType is PointCloud
  // and the modal is open
  activators: [
    // each activator is a function that returns true
    // given contextual information (mode, mediaType, etc)
    fop.activators.mediaTypes.pointCloud, // | video | image
    fop.activators.vizualizerMode.modal, // | thumbnail
    // you can also provide your own custom activators
    // all must return true to activate the plugin
    ({sample}) => sample.myField === 'myValue'
  ]
})
```

### Adding a custom Plot

```jsx
import * as fop from '@fiftyone/plugins'

// this is a example using existing react libraries
// to build a bespoke Plot type
// end of existing react library usage

// this separate components shows where the fiftyone plugin
// dependent code ends and the pure react code begins
function CustomPlot({sample}) {
  const src = fov.getSampleSrc(sample.filepath)
  // now that we have all the data we need
  // we can delegate to code that doesn't depend
  // on the fiftyone plugin api
  return <Plot src={src} />
}

fop.registerComponent({
  // component to delegate to
  copmponent: CustomPlot,
  // tell fiftyone you want to provide a Visualizer
  type: PluginComponentTypes.Plot,
  // used for the plot selector button
  label: 'Map',
  // only show the Map plot when the dataset has Geo data
  activator: ({dataset}) => dataset.sampleFields.geoPoints
})
```

### Reacting to State Changes

```tsx
import * as fop from '@fiftyone/plugins'

// this example demonstrates handling updates to
// filters/sidebar, but applies to everything
// listed under "state" below
function MyPlugin() {
  // useValue 
  
  const activeFields = fop.useValue(fop.state.activeFields)

  // 
  return <ul>{activeFields.map(f => <li>{f.name}</li>)}
}


```

### State

List of available state to hook into/react to changes of.

Note: state is read-only.

```ts
type State = {
  modal: Boolean,
  activeFields: Field[],
  pathFilter: Filter,
  fullscreen: Boolean,
  timeZone: String, 
  showSkeletons: Boolean,
  defaultSkeleton: Skeleton,
  skeletons: Skeletons[],
  pointFilter: (path: string, value: Point) => boolean,
  selectedLabels: Labels[],
  thumbnail: Boolean,
  frameRate: Number,
  frameNumber: Number,
  dataset: Dataset,
  sample: Sample,
  error: AppError
}
```

### Interactivity

If your plugin only has internal state, you can use existing mechansims in react or libaries you are using to achieve your
desired ux. Eg. in a 3d Visualizer, you might want to use
Thee.js and its object model, events, and state management.

If you want to allow users to interact with other aspects of fiftyone through your plugin, you can use the api below.

```jsx
// note: similar to react hooks, these must be used in the context
// of a React component

// select a dataset
const changeDataset = fop.useAction(fop.actions.changeDataset)

// in a callback
changeDataset('quickstart')
```

Available Actions:

- `changeDataset(datasetName)`
- `selectSample(sampleId)`
- `tagSample(options)`
- `nextSample()` / `prevSample()`

Note: this list will intentionally start small and be added to when plugin developers need them.