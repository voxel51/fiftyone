# FiftyOne Packaging

This folder contains supporting code to package most sub-packages of FiftyOne.
FiftyOne packages are distributed as [wheels](https://pythonwheels.com/)
installable with `pip`.

## Packaging `fiftyone` and `fiftyone-brain`

Simply run `python setup.py bdist_wheel` in the root of each repository. This
will generate an appropriately-named `.whl` file in the `dist` folder, which
can be uploaded to a PyPI registry.

## Packaging `fiftyone-db`

To build this package, you need the appropriate MongoDB binaries (`mongo` and
`mongod`) installed in `package/db/src/bin`. See `install.bash` for download
links if you don't already have these binaries. Once the binaries are in the
right location, switch to the `package/db` folder and follow the packaging
instructions for `fiftyone` above.

## Packaging `fiftyone-gui`

Before building this package, you need to have built a native Electron app for
your target platform. To do this, switch to the `electron` folder and run
`yarn package-linux`, `yarn package-mac`, or `yarn package-win`. This may take
several minutes to complete. Once the Electron app is built, switch to the
`package/gui` folder and follow the packaging instructions for `fiftyone`
above.
