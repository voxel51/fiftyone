# FiftyOne Teams

This document describes how we develop FiftyOne Teams, which is a private fork
of [FiftyOne](https://github.com/voxel51/fiftyone).

## Pulling changes from FiftyOne

The `public` branch in this repository should match `develop` in
[FiftyOne](https://github.com/voxel51/fiftyone).

To merge the latest [FiftyOne](https://github.com/voxel51/fiftyone) into
FiftyOne Teams, make sure `public` is up-to-date and then open a pull request
into `develop`.

Note that the `public` branch is protected, except for administrators, so if
you are not an admin and need to update the `public` branch, you must do so via
a pull request.

### Administrators

Be sure to have [FiftyOne](https://github.com/voxel51/fiftyone) added as the
`public` remote:

```shell
git remote add public git@github.com:voxel51/fiftyone.git
```

Then you can merge changes from [FiftyOne](https://github.com/voxel51/fiftyone)
into the `public` branch as follows:

```
git checkout public
git pull public develop
git push origin public
```

## Creating a pull request into FiftyOne

When developing features privately intended to reach the public
[FiftyOne](https://github.com/voxel51/fiftyone) repository, it is best to
branch from `public` and not `develop`.

```
git checkout public
git checkout -b my-feature
# finish your feature, make commits
```

Open a pull request to merge `my-feature` into `public`.

To add the changes to the public repository,
[FiftyOne](https://github.com/voxel51/fiftyone), switch to your local clone of
the open source project and add this repository as a remote:

```shell
cd /path/to/public/fiftyone
git remote add teams git@github.com:voxel51/fiftyone-teams.git
git checkout -b release-to-public
git pull teams public
git push origin release-to-public
```

## Adding a Teams feature to FiftyOne

In this case, the assumption is that feature has been refactored to fit within
the structure of the open source project. Branch from `public` and commit the
the code that will be made public.

Then follow the normal steps to make a pull request in the public
[FiftyOne](https://github.com/voxel51/fiftyone) project.

As these workflows solidify, syncing between the projects should be automated
to whatever extent possible.

## Documenting Teams releases

Currently release notes for Teams release are documented
[in this doc](https://docs.google.com/document/d/1SvoJRXiajm14jXaenD9GottSEoQlOVCNcyMEV8qrF-g).

## Installing Teams releases

FiftyOne Teams releases are installed via a private FiftyOne PyPI server that
we maintain at https://pypi.fiftyone.ai.

You should ask for a token if you don't have one already.

```shell
# basic install
pip install --index-url https://<token>@pypi.fiftyone.ai fiftyone

# desktop install
pip install --index-url https://<token>@pypi.fiftyone.ai fiftyone[desktop]
```

### Adding user tokens

PyPI admins can add additional user tokens as follows:

```shell
curl -X POST -F 'email=user@company.com' https://admin:<password>@pypi.fiftyone.ai/admin/create_token/save
```

## Using Teams on bb1

We maintain a shared deployment of FiftyOne Teams on bb1 (voxelbb1.ddns.net).

Add yourself to the `cowboys` group on bb1 if you are not in the group already.
This ensures data files created in `/scratch/fiftyone` have acceptable
permissions for everyone else.

Then add the following to your `~/.bashrc`:

```shell
export FIFTYONE_DATABASE_URI=mongodb://localhost:27017
export FIFTYONE_DO_NOT_TRACK=true

# Auto-populated media (eg unpacking TFRecords) will be written here
export FIFTYONE_DEFAULT_DATASET_DIR=/scratch/fiftyone/default

# Zoo datasets will be downloaded here
export FIFTYONE_DATASET_ZOO_DIR=/scratch/fiftyone/zoo

# Zoo models will be downloaded here
export FIFTYONE_MODEL_ZOO_DIR=/scratch/fiftyone/models
```

This will be your default environment when using FiftyOne on bb1. You can read
about other configuration options
[here](https://voxel51.com/docs/fiftyone/user_guide/config.html) if you prefer
a different behavior.

When adding data to this shared database, ensure that all media is placed
within `/scratch/fiftyone` so other users will have access.
