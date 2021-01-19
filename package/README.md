# FiftyOne Packaging

FiftyOne consists of several packages:

-   `fiftyone`: the core library
-   `fiftyone-db`: a bundled copy of MongoDB
-   `fiftyone-desktop`: a bundled production build of the FiftyOne Electron App
-   `fiftyone-brain`: (external; proprietary)
-   `voxel51-eta`: (external; see https://github.com/voxel51/eta)

These packages are distributed as [wheels](https://pythonwheels.com/)
installable with `pip`. They are separated in this way to enable individual
packages to be upgraded if necessary while minimizing download size.

## Versioning

The `fiftyone` package is versioned according to the impact of changes in each
release. Due to `fiftyone` being tightly coupled to the other packages listed
above, it should generally require relatively strict version ranges. For
example:

-   `fiftyone-db>=1.2,<2` would require at least `fiftyone-db` 1.2, would also
    allow 1.2.1, 1.3.0, but would not allow 2.0 or above.
-   `fiftyone-db>=1.2,<1.3` differs from the above by not allowing
    `fiftyone-db` 1.3.0 or above

Care should be taken when assigning version numbers to packages that `fiftyone`
depends on. Generally, following [Semantic Versioning](https://semver.org/) for
them is recommended. For instance:

-   A `fiftyone-desktop` hotfix that is separate from a `fiftyone` release
    should use a version number allowed by the latest `fiftyone` release
-   A `voxel51-eta` release that breaks compatibility with the latest
    `fiftyone` release should use a version number above the range allowed by
    the latest `fiftyone` release so that users installing `fiftyone` do not
    end up with a broken installation. (Exceptions can be made, e.g. in the
    case of rarely-used functionality.)

## Automated builds

Currently, release builds are automated using
[GitHub Actions](https://github.com/features/actions). Workflows for each
package are located in the `.github/workflows` directory. Wheels are always
built when the workflow runs, and are downloadable as workflow artifacts.
Wheels are also published to PyPI under the following circumstances:

-   `fiftyone` wheels (and documentation) are published when a tag matching
    `v*` is pushed. `*` must match the version in `setup.py`.
-   `fiftyone-db` wheels are published when a tag matching `db-v*` is pushed.
    `*` must match the version in `package/db/setup.py`.
-   `fiftyone-desktop` wheels are published when a tag matching `desktop-v*` is
    pushed. `*` must match the version in `package/desktop/setup.py`.
    -   For consistency, upgrading the versions in all `package.json` files is
        also recommended

It is recommended to:

-   Publish all dependencies of `fiftyone` that the new release depends on
    _before_ publishing `fiftyone`. This ensures that users are never able to
    download a `fiftyone` package whose dependencies have not been published
    yet.
    -   The test workflow currently installs the latest pre-release of
        `voxel51-eta` if available (alpha/beta/rc) - this allows tests to use
        bleeding-edge versions of ETA published to PyPI without making them
        available to end-users by default. This is usually only necessary if
        `fiftyone` tests fail without new ETA features. However, pre-releases
        are intentionally not installed for tests run on release branches/tags,
        so a stable release of `voxel51-eta` will need to be available before a
        `fiftyone` release can be made.
-   Create the tags on a release branch and wait for builds to be published
    successfully before merging the branch.
-   Update `master` after the release has been merged into `develop`:
    `git push origin develop:master`

If the `publish` step of a workflow fails and has uploaded some (but not all)
packages to PyPI, you will likely need to upload the rest manually (e.g. with
`twine`). Downloading and extracting individual `wheel-*.zip` artifacts will
give `*.whl` files that can be uploaded.

## Manual builds

FiftyOne and its related packages can also be built manually. The `package`
folder contains supporting code to package `fiftyone-db` and
`fiftyone-desktop`; the main `fiftyone` package is handled by the top-level
`setup.py`.

For each package, `python setup.py bdist_wheel` in the appropriate folder will
generate a wheel for the current platform. For some packages, this is
configurable as detailed below.

### Packaging `fiftyone`

The wheel for this package will work on any supported platform and Python
version - no extra steps are necessary.

The `fiftyone` wheel works on any platform. The `fiftyone-brain` wheel
currently must be built on the target platform.

### Packaging `fiftyone-brain`

The wheel for this package is tied to a specific platform and Python version.
By default, it will be built for your current platform - to change this, add
`--plat-name linux`, `--plat-name mac`, or `--plat-name win` to the
`bdist_wheel` command above. (The build process will replace these names with
the proper platform names recognized by `pip`.)

Building for separate Python versions currently must be done manually, e.g. by
creating separate virtual environments. [pyenv](https://github.com/pyenv/pyenv)
is one way to install multiple isolated Python versions.

### Packaging `fiftyone-db`

This package can be built from within the `package/db` directory. The wheel for
this package is platform-specific but will work with any supported Python
version. To target a platform other than your current one, add
`--plat-name mac` or `--plat-name linux` to the `bdist_wheel` command.

As part of the build process, MongoDB is downloaded and cached in
`package/db/cache`. If you have already downloaded MongoDB and would like to
avoid a second download, you can copy the archive here - refer to
`package/db/setup.py` for the expected filename (which should match the
download URL).

### Packaging `fiftyone-desktop`

This package supports the same platforms as `fiftyone-db` and the same
portability constraints apply. It can be built from within the
`package/desktop` directory.

Before building this package, you need to have built a native Electron app for
your target platform. To do this, switch to the `electron` folder and run
`yarn package-linux` or `yarn package-mac`. This may take several minutes to
complete, and may require additional system packages - see
[this page](https://www.electron.build/multi-platform-build) for details. Once
the Electron app is built, switch to the `package/desktop` folder and build a
wheel using the above instructions.

### Testing with built wheels locally

Once you have built the wheels you want to test with, you can simply run
`pip install /path/to/dist/fiftyone-something.whl` in a separate environment to
install them manually. Note that the main `fiftyone` package currently depends
on the other packages, so they will need to be installed first.

If you are reinstalling wheels frequently for testing purposes, adding
`--force-reinstall` to `pip install` will force reinstallation, and `--no-deps`
will skip reinstalling dependencies.

### Testing package uploads locally

You can spin up a local PyPI server instance (in this example, accessible at
`localhost:5159`) with:

```
cd package/pypi-server/local
chmod a+w packages
docker-compose up -d
```

Note that this instance (as well as the command with `-a . -P .` below) allows
**unauthenticated uploads**, so do not use this in production!

An alternative `docker` command if you don't have `docker-compose` installed:

```shell
docker run --rm -d -p 5159:8080 pypiserver/pypiserver:latest -a . -P . /data/packages
```

In this case, if you want to save packages across runs, you can bind
`/data/packages` in the container to a local folder by adding
`-v /path/to/local/folder:/data/packages` before `pypiserver/pypiserver:latest`
in the above command. Note that this folder's permissions need to be set
properly (`chmod a+w`) or you will run into 500 server errors when uploading
packages.

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
where you built the package. Note that this uses
[`twine`](https://pypi.org/project/twine/), which is installed as a dev
requirement in this project.

```
twine upload -r local dist/*.whl
```

You can also explicitly pass the paths of one or more wheels to `twine upload`
if there are some that you don't want to upload.

To download packages from this instance, add `--index http://localhost:5159` to
`pip install`. (If your instance is on another host and is not HTTPS-enabled,
you will need to add `--trusted-host <hostname>` as well.)

#### Testing on other Linux distributions

The `test-envs` folder contains some scripts to help with testing on various
Linux distributions. You will need Docker installed. Note that the base images
are typically very minimal compared to a typical desktop installation, but if
FiftyOne works in them, chances are good that it will work in a full
installation as well.

-   `test-envs/build.bash` will build all available images from the
    `dockerfiles` subfolder. You can optionally pass the names of one or more
    files to build from as arguments.
-   `test-envs/run.bash IMAGE_NAME` will spin up a container from the specified
    image and connect it to your local machine's network (so it will be able to
    connect to your local pypi server if needed).
    -   Note that the pip cache is mounted to the `pip-cache` subfolder to
        speed up downloads. You can clear this folder to replicate a true fresh
        install.
