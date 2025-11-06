# `fiftyone-db`

Supporting package for [FiftyOne](https://pypi.org/project/fiftyone).

## Releasing the fiftyone-db package

> [!NOTE]
> These steps are to be performed by authorized Voxel51 engineers.

The `fiftyone-db` package is usually cut from the `fiftyone:develop` branch.
The PyPI uploads will be triggered when a release tag is pushed to the
repository:

1. Navigate to the
   [releases page](hhttps://github.com/voxel51/fiftyone/releases).

1. Select `Draft a new release`.

1. Select `Create new tag` with the appropriate version and set the target to
   `main`.

    1. The tag format is `db-v<semantic-version>`.
       For example, `db-v1.3.0`. 
       This should match the `setup.py` and release branch.

1. Select `Generate release notes`.

1. Uncheck `Set as the latest release`.

1. Select `Publish release`.

This will create a new tag in the repository and will trigger the
[build/publish workflow](https://github.com/voxel51/fiftyone/blob/develop/.github/workflows/build-db.yml).
This workflow will build the `.whl` artifacts and publish them to
[PyPI](https://pypi.org/project/fiftyone-db/).
