# FiftyOne Packaging

FiftyOne consists of several packages:

-   `fiftyone`: the core library
-   `fiftyone-db`: a bundled copy of MongoDB

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
them is recommended.

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

It is recommended to:

-   Publish all dependencies of `fiftyone` that the new release depends on
    _before_ publishing `fiftyone`. This ensures that users are never able to
    download a `fiftyone` package whose dependencies have not been published
    yet.
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
folder contains supporting code to package `fiftyone-db`; the main `fiftyone`
package is handled by the top-level `setup.py`.

For each package, `python setup.py bdist_wheel` in the appropriate folder will
generate a wheel for the current platform. For some packages, this is
configurable as detailed below.

### Packaging `fiftyone`

The wheel for this package will work on any supported platform and Python
version - no extra steps are necessary.

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

### Testing with built wheels locally

Once you have built the wheels you want to test with, you can simply run
`pip install /path/to/dist/fiftyone-something.whl` in a separate environment to
install them manually. Note that the main `fiftyone` package currently depends
on the other packages, so they will need to be installed first.

If you are reinstalling wheels frequently for testing purposes, adding
`--force-reinstall` to `pip install` will force reinstallation, and `--no-deps`
will skip reinstalling dependencies.
