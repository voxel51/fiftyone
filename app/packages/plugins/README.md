# FiftyOne Plugins

FiftyOne provides a plugin system that you can use to customize and extend its
behavior!

This document describes how to develop, publish, and install custom plugins.

## Configuring your plugin directory

First, create a directory where you want to store your plugins.

Subsequently, when running FiftyOne, you must specify the location of this
directory by setting the `FIFTYONE_PLUGINS_DIR` environment variable:

```shell
export FIFTYONE_PLUGINS_DIR=/path/to/your/plugins
```

You can also permanently configure this directory by adding it to your
[FiftyOne config](https://voxel51.com/docs/fiftyone/user_guide/config.html):

```json
{
  "plugins_dir": "/path/to/your/plugins"
}
```

If you are running an instance of your fiftyone app server, you will need to restart it to
pick up this new setting.

> NOTE: your plugins directory must be readable by the FiftyOne server.

## Installing plugins manually

Fiftyone will try and find your plugin's `package.json` file within the plugin directory
described above. Below is an example of a typical plugin directory.

```txt
/my-fiftyone-plugins
  /my-plugin-1
    /package.json
    /dist
      /my-plugin.min.js
  /my-plugin-2
    /package.json
    /dist
      /my-plugin2.min.js
```

In order to manually install a plugin, you must copy the plugin's directory into your plugin directory so that it matches the structure above.

If your fiftyone app server is already running, you should restart the server and refresh any connected browser clients to see the plugins show up.

> NOTE: if you do not see your plugin - make sure the package.json file is present and
> has the appropriate `fiftyone.script` setting described below.

## Installing plugins with a package manager or git

In order to install plugins with a package manager,
you must have one of the following tools available
in the environment you are running FiftyOne:

- `npm`
- `yarn`
- `git` - if installing from a git repo

Once you have a plugins directory setup, you must create a shell package to
version your plugins:

```shell
cd $FIFTYONE_PLUGINS_DIR

yarn init

# or with npm
npm init
```

Now you can install a node package that contains a plugin:

```shell
# if it is avaialable on plubic/private npm registry
yarn add my-fiftyone-plugin

# or with npm
npm install my-fiftyone-plugin --save
```

If your plugin is only available in a git repository, you can still install via
git, although the environment must be configured to allow reading from that git
repository:

```shell
# install via a github http url
yarn add my-plugin@https://github.com/user/my-plugin.git#my-branch-name

# install via ssh/repo
yarn add ssh://github.com/user/my-plugin#my-branch
```

## Configuring plugins

You can store system-wide plugin configurations under the plugins key of your App config or dataset. This allows for configuring plugins at the application wide level or per dataset.

See the [configuring plugins](https://voxel51.com/docs/fiftyone/user_guide/config.html#configuring-plugins) user guide for info on changing a plugin's configuration.

> NOTE: you can see an example of dataset level plugin configuration in the [map plugin](https://voxel51.com/docs/fiftyone/user_guide/app.html#map-tab) user guide.

## Developing plugins

In order to develop and test your plugin you will need the following:

- A development install of FiftyOne
- The FiftyOne App setup for development
- A plugin skeleton (start with one of the plugins in voxel51/fiftyone-plugins)
- npm link / symlink to the `@fiftyone/plugins` package
- npm link / symlink to the `@fiftyone/aggregations` package (optional)

> Note you cannot use relative paths to load these modules. They must be loaded using the `from '@fiftyone/$PKG_NAME'` syntax.
> This allows the build to externalize them, so they are loaded at runtime by the parent application.

For local testing, follow these basic steps:

First ensure your plugin's `package.json` includes the path to the plugin
script:

```json
{
  "fiftyone": {
    "script": "dist/index.umd.js"
  }
}
```

Then follow the steps below, in separate terminal sessions as needed.

```shell
# tell FiftyOne where you want to load plugins from
# this should be the parent directory to all your plugins
FIFTYONE_PLUGINS_DIR=/path/to/your/plugins

# start the FiftyOne App in dev mode
cd $FIFTYONE/app/packages/app
yarn dev

# start the FiftyOne python server (in a separate session)
cd $FIFTYONE
python fiftyone/server/main.py

# ensure your plugin has a symlink to the @fiftyone/plugins package
cd $FIFTYONE/app/packages/plugins
npm link
cd $MY_PLUGIN
npm link @fiftyone/plugins

# note: if you are using the @fiftyone/aggregations package
# you will need to follow the same linking steps for that package

# now you can build your plugin for development
yarn build
```

You should now have a running FiftyOne server and App, including your plugin.

NOTE: each time you change you plugin's source you must rebuild using
`yarn build`. You can setup a watcher to do this automatically
(see: [nodemon](https://www.npmjs.com/package/nodemon)).

## Publishing your plugin

You can publish your plugin to either a public/private npm registry or a git
repository. Including your package.json and built (dist) files is required for
both. No other files are required to be published with your plugin.

Before publishing make sure you do the following:

- Login to the registry you are trying to publish to
- OR use a `.npmrc` to include private registry credentials
- Have the correct name, version, etc in your package.json
- Have a built plugin `dist` directory
- Your `package.json` points to the plugin entry point

Then to publish your latest plugin to an npm registry:

```shell
yarn publish

# or with npm
npm publish
```

If you are using a git repository to publish your plugins, you must ensure that
you include the `dist` directory when pushing to the remote repo.

## How to write plugins

Below are introductory examples to the FiftyOne plugin API.

### Hello world

A simple hello world plugin, that renders "hello world" in place of the plots
main content area, would look like this:

```jsx
import { registerComponent, PluginComponentTypes } from "@fiftyone/plugins";

function HelloWorld() {
  return <h1>Hello World</h1>;
}

registerComponent({
  copmponent: HelloWorld,
  type: PluginComponentTypes.Plot,
});
```

Installing the plugin above would require building a bundle JS file and placing
in a directory with a `package.json` file.

The FiftyOne python server will then detect this as an installed plugin and the
App will load it and render it.

### Adding a custom FiftyOne Visualizer

```jsx
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/visualizer";

function PointCloud({ src }) {
  // TODO: implement your visualizer using React
}

// this separate components shows where the FiftyOne plugin
// dependent code ends and the pure react code begins
function CustomVisualizer({ sample }) {
  const src = fos.getSampleSrc(sample.filepath);
  // now that we have all the data we need
  // we can delegate to code that doesn't depend
  // on the FiftyOne plugin API
  return <PointCloud src={src} />;
}

fop.registerComponent({
  // component to delegate to
  copmponent: CustomVisualizer,
  // tell FiftyOne you want to provide a Visualizer
  type: PluginComponentTypes.Visualizer,
  // activate this plugin when the mediaType is PointCloud
  activator: ({ dataset }) => dataset.mediaType === "PointCloud",
});
```

### Adding a custom Plot

```jsx
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/plugins";
import * as foa from "@fiftyone/aggregations";
import AwesomeMap from "react-mapping-library";

function CustomPlot() {
  const dataset = useRecoilValue(fos.dataset);
  const view = useRecoilValue(fos.view);
  const filters = useRecoilValue(fos.filters);
  const [aggregate, points, loading] = foa.useAggregation({
    dataset,
    filters,
    view,
  });

  React.useEffect(() => {
    aggregate(
      [
        new foa.aggregations.Values({
          fieldOrExpr: "id",
        }),
        new foa.aggregations.Values({
          fieldOrExpr: "location.point.coordinates",
        }),
      ],
      dataset.name
    );
  }, [dataset, filters, view]);

  if (loading) return <h1>Loading</h1>;

  return <MyMap geoPoints={points} />;
}

fop.registerComponent({
  // component to delegate to
  copmponent: CustomPlot,
  // tell FiftyOne you want to provide a custom Plot
  type: PluginComponentTypes.Plot,
  // used for the plot selector button
  label: "Map",
  // only show the Map plot when the dataset has Geo data
  activator: ({ dataset }) => dataset.sampleFields.location,
});
```

### Reacting to state changes

```tsx
import * as fos from '@fiftyone/state'
import * as recoil from 'recoil'

// this example demonstrates handling updates to
// filters/sidebar, but applies to everything
// listed under "state" below
function MyPlugin() {
  const activeFields = recoil.useRecoilValue(fos.activeFields)

  return <ul>{activeFields.map(f => <li>{f.name}</li>)}
}
```

### Interactivity and state

If your plugin only has internal state, you can use existing state management
to achieve your desired ux. For example, in a 3D visualizer, you might want to
use Thee.js and its object model, events, and state management. Or just use
your own React hooks to maintain your plugin components internal state.

If you want to allow users to interact with other aspects of FiftyOne through
your plugin, you can use the `@fiftyone/state` package:

```jsx
// note: similar to react hooks, these must be used in the context
// of a React component

// select a dataset
const selectLabel = fos.useOnSelectLabel();

// in a callback
selectLabel({ id: "labelId", field: "fieldName" });
```

## Reading settings in your plugin

Somme plugins use libraries or tools that require credentials such as API keys
or tokens. Below is an example for how to provide and read these credentials.

The same mechanism can be used to expose configuration to plugin users, such as
color choices, and default values.

You can store a setting in either the App config or an individual dataset. Here's an example of both.

```js
// app_config.json
{
  "plugins": {
    "my-plugin": {
      "mysetting": "foo"
    }
  }
}
```

Now lets take that setting and change it for the `quickstart` dataset.

```py
import fiftyone as fo
dataset = fo.load_dataset("quickstart")

# Modify the dataset's App config
dataset.app_config.plugins["my-plugin"] = {
  "mysetting": "bar"
}

dataset.save()
```

Then in your plugin implementation, you can read settings with the
`useSettings` hook:

```js
const { mysetting } = fop.useSettings("my-plugin");
```

## Querying FiftyOne

The typical use case for a plugin is to provide a unique way of visualizing
FiftyOne data. However some plugins may need to also fetch data in a unique way
to efficiently visualize it.

For example, a `PluginComponentType.Plot` plugin rendering a map of geo points
may need to fetch data relative to where the user is currently viewing. In
MongoDB, such a query would look like this:

```js
{
  $geoNear: {
    near: { type: "Point", coordinates: [ -73.99279 , 40.719296 ] },
    maxDistance: 2,
    query: { category: "Parks" },
  }
}
```

In a FiftyOne plugin this same query can be performed using the
`useAggregation()` method of the plugin SDK:

```js
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import * as foa from "@fiftyone/aggregations";
import * as recoil from "recoil";

function useGeoDataNear() {
  const dataset = useRecoilValue(fos.dataset);
  const view = useRecoilValue(fos.view);
  const filters = useRecoilValue(fos.filters);
  const [aggregate, points, isLoading] = foa.useAggregation({
    dataset,
    filters,
    view,
  });
  const availableFields = findAvailableFields(dataset.sampleFields);
  const [selectedField, setField] = React.useState(availableFields[0]);

  React.useEffect(() => {
    aggregate([
      new foa.aggregations.Values({
        fieldOrExpr: "location.point.coordinates",
      }),
    ]);
  }, []);

  return {
    points,
    isLoading,
    setField,
    availableFields,
    selectedField,
  };
}

function MapPlugin() {
  const { points, isLoading, setField, availableFields, selectedField } =
    useGeoDataNear();

  return (
    <Map
      points={points}
      onSelectField={(f) => setField(f)}
      selectedField={selectedField}
      locationFields={availableFields}
    />
  );
}

fop.registerComponent({
  name: "MapPlugin",
  label: "Map",
  activator: ({ dataset }) => findAvailableFields(dataset.fields).length > 0,
});
```
