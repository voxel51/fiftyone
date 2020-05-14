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

## Testing package uploads locally

You can spin up a local PyPI server instance (in this example, accessible at
`localhost:5159`) with:

```
docker run --rm -d -p 5159:8080 pypiserver/pypiserver:latest -a . -P . /data/packages
```

Note that `-a . -P .` allows **unauthenticated uploads**, so do not use this in
production!

If you want to save packages across runs, you can bind `/data/packages` in the
container to a local folder by adding `-v /path/to/local/folder:/data/packages`
before `pypiserver/pypiserver:latest` in the above command. Note that this
folder's permissions need to be set properly or you will run into 500 server
errors when uploading packages.

Before uploading packages to this instance, create `~/.pypirc` with:

```
[distutils]
index-servers =
    local

[local]
repository: http://localhost:5159
username:
password:
```

If you have a `~/.pypirc` file already, add the `[local]` section and `local`
under `index-servers`. The `local` name can be changed as long as you are
consistent.

To upload a package to this instance, run the following command in the folder
where you built the package:

```
python setup.py bdist_wheel upload -r local
```
