# Releaseses

## Packages

-   [fiftyone](https://pypi.org/project/fiftyone/) - `./` (pure python)
-   [fiftyone-brain](https://pypi.org/project/fiftyone-brain/) -
    `./package/brain` (pure python)
-   [fiftyone-db](https://pypi.org/project/fiftyone-db/) - `./package/db`
-   [fiftyone-desktop](https://pypi.org/project/fiftyone-desktop/) -
    `./package/desktop`
-   [voxel51-eta](https://pypi.org/project/voxel51-eta/) -
    [repository](https://github.com/voxel51/eta) (pure python)

## Tags

Except in rare situations for hotfixes, all updates to packages are released at
the same time to support a common announcement cycle.

Official releases for packages defined in this repository can be found
[here](https://github.com/voxel51/fiftyone/releases). They are associated with
tags of the following format:

-   `fiftyone` - `vX.X.X`
-   `fiftyone-db` - `db-vX.X.X`
-   `fiftyone-desktop` - `desktop-vX.X.X`

Tags that match one of the above formats will kick off a build, test, and
publish workflow to [PyPI](https://pypi.org/) for the respective package.

When testing a tagged release, all dependencies are installed from PyPI, as
opposed to be being built from source to ensure the readiness of the release
and its dependencies.

## Release Candidates

Release candidates for the above packages can be published by adding a `-rc.X`
suffix to the tag, e.g. `v0.16.0-rc.0` will publish version `0.16.0rc0` of the
`fiftyone` package.

TODO: Remove the inconsistancy between RC tags and their published versions,
i.e. `*-rc.X` and `rcX`
