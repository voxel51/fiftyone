# FiftyOne Teams

Guide to developing in the private Teams fork of
[FiftyOne](https://github.com/voxel51/fiftyone)

## Pulling in changes in from [FiftyOne](https://github.com/voxel51/fiftyone)

The `public` branch in
[FiftyOne Teams](https://github.com/voxel51/fiftyone-teams) should match
`develop` in [FiftyOne](https://github.com/voxel51/fiftyone).

Be sure to have `fiftyone` added as the `public` remote:

```sh
git remote add public git@github.com:voxel51/fiftyone.git
```

Merge in changes from `fiftyone` into the `public` branch:

```
git checkout public
git pull public develop
git push origin public # protect the `public` branch?
```

Open a pull request for `public` to be merged into `develop`. Can we automate
this?

## Creating a pull request from [FiftyOne Teams](https://github.com/voxel51/fiftyone-teams) into [FiftyOne](https://github.com/voxel51/fiftyone)

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
the open source project and add
[FiftyOne Teams](https://github.com/voxel51/fiftyone-teams) as a remote:

```sh
cd /path/to/public/fiftyone
git remote add teams git@github.com:voxel51/fiftyone-teams.git
git checkout -b release-to-public
git pull teams public
git push origin release-to-public
```

## Adding a previously "Teams"-only feature to the public [FiftyOne](https://github.com/voxel51/fiftyone)

In this case, the assumption is that feature has been refactored to fit within
the structure of the open source project. Branch from `public` and commit the
the code that will be made public.

Then follow the normal steps to make a pull request in the public
[FiftyOne](https://github.com/voxel51/fiftyone) project.

As these workflows solidify, syncing between the projects should be automated
to whatever extent possible.

## Installing FiftyOne Teams releases from private FiftyOne PyPI server

You should ask for a token if you don't have one already.

```sh
pip install --index-url https://<token>@pypi.fiftyone.ai fiftyone
```

## Working with BB1 Teams

Add yourself to the `cowboys` group on `bb1` if you are not in the group
already. This ensures data files created in `/scratch/fiftyone` have acceptable
permissions for everyone else.

Add the following to your `~/.bashrc`:

```sh
export FIFTYONE_DO_NOT_TRACK=true # for good measure
export FIFTYONE_DATASET_ZOO_DIR=/scratch/fiftyone/zoo
export FIFTYONE_DEFAULT_DATASET_DIR=/scratch/fiftyone/datasets
export FIFTYONE_DATABASE_URI=mongodb://localhost:27017
```

This will be your default environment when using `fiftyone` on `bb1`. You can
read about other configuration options
[here](https://voxel51.com/docs/fiftyone/user_guide/config.html) if you prefer
a different behavior.

Note that using the App requires port forwarding with `ssh`:

```sh
ssh -N -L <local-port>:127.0.0.1:<remote-session-port> <user>@voxelbb1.ddns.net
```

When adding data to this shared database, ensure that all media is placed
within `/scratch/fiftyone` so other users will have access.

That's it!
