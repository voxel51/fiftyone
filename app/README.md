# FiftyOne - App

<img src="https://user-images.githubusercontent.com/3719547/74191434-8fe4f500-4c21-11ea-8d73-555edfce0854.png" alt="voxel51-logo.png" width="40%"/>

## Installation

The following installation steps are a part of the
[install script](../install.bash)

First, install [`nvm`](https://github.com/nvm-sh/nvm) and install and set your
node version to `v16.4.2` using `nvm`.

```sh
nvm install v16.4.2
nvm use v16.4.2
```

Then install `yarn` globally in your node environment with `npm`:

```
npm -g install yarn
```

Install the app with `yarn` in this directory (`./fiftyone/app`):

```sh
yarn install
```

# Starting development

```sh
yarn dev
```

This starts the App client development server with hot reloading.

You will need to create a `fiftyone.core.session.Session` to start the backend
server. Or you can start the backend server directly in your python virtual
environment:

```sh
# in ./fiftyone/server/
python main.py
```

That's it!

## Copyright

Copyright 2017-2022, Voxel51, Inc.<br> voxel51.com
