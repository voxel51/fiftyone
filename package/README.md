# FiftyOne Packaging

This folder contains supporting code to package most sub-packages of FiftyOne.
FiftyOne packages are distributed as [wheels](https://pythonwheels.com/)
installable with `pip`.

## Packaging `fiftyone` and `fiftyone-brain`

Simply run `python setup.py bdist_wheel` in the root of each repository. This
will generate an appropriately-named `.whl` file in the `dist` folder, which
can be uploaded to a PyPI registry.

The `fiftyone` wheel works on any platform. The `fiftyone-brain` wheel
currently must be built on the target platform.

## Packaging `fiftyone-db`

This package uses the same build process as `fiftyone` above. By default, it
will build a wheel for your current platform, but you can add `--plat-name mac`
or `--plat-name linux` to the `bdist_wheel` command to change the target
platform.

As part of the build process, MongoDB is downloaded and cached in
`package/db/cache`. If you have already downloaded MongoDB and would like to
avoid a second download, you can copy the archive here - refer to
`package/db/setup.py` for the expected filename (which should match the
download URL).

## Packaging `fiftyone-gui`

Before building this package, you need to have built a native Electron app for
your target platform. To do this, switch to the `electron` folder and run
`yarn package-linux` or `yarn package-mac`. This may take several minutes to
complete. Once the Electron app is built, switch to the `package/gui` folder
and follow the packaging instructions for `fiftyone` above.

As with `fiftyone-db`, if you are building a wheel for another platform,
specify the target platform with `--plat-name`.

## Testing with built wheels locally

Once you have built the wheels you want to test with, you can simply run
`pip install /path/to/dist/fiftyone-something.whl` in a separate environment to
install them manually. Note that the main `fiftyone` package currently depends
on the other packages, so they will need to be installed first. You may be able
to work around this requirement with `pip install --no-deps` and installing
`fiftyone`'s dependencies manually (i.e.
`pip install /path/to/fiftyone/requirements.txt`).

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
