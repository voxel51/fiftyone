# FiftyOne Teams

This document describes how we develop FiftyOne Teams, which is a private fork
of [FiftyOne](https://github.com/voxel51/fiftyone).

## Teams Documentation

The
[FiftyOne Teams User Manual](https://docs.google.com/document/d/1Y4lZpMxlajj20EeIvDu7cRGPcjWwT4rTnG-vtjVilUc)
currently contains the public-facing documentation for Teams.

Release notes for Teams releases are documented
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

## Pulling changes from FiftyOne

The `public` branch in this repository should match `develop` in
[FiftyOne](https://github.com/voxel51/fiftyone).

To merge the latest [FiftyOne](https://github.com/voxel51/fiftyone) into this
repository, the basic workflow is to update `public` and then open a pull
request into `develop`. See below for details.

### Setup

You must add [FiftyOne](https://github.com/voxel51/fiftyone) as a remote
repository for the `public` branch:

```shell
git remote add public git@github.com:voxel51/fiftyone.git
```

Note that the `public` branch is protected, so, if you are not an admin, you
must replace `public` in the instructions below with another branch and then
make a pull request into `public` rather than directly pushing to it.

### Updating `public`

Follow the instructions below to update the `public` branch to match
[FiftyOne](https://github.com/voxel51/fiftyone)'s `develop` branch:

```shell
# Pull open source changes
git checkout public
git pull public develop

# If you are not an admin, you must create a pull request into `public` instead
git push origin public
```

### Merging `public` into `develop`

Once `public` is updated, create a pull request into the `develop` branch of
this repository like so:

```shell
git checkout develop
git checkout -b new-branch

git merge public

# Resolve merge conflicts
# Make any Teams-specific upgrades like cloud friendliness
```

Be careful that you have properly addressed any merge conflicts and performed
any necessary upgrades such as making newly-added open source features
cloud-friendly.

See [this section](#teams-developer-guide) for more details on upgrading open
source features.

## Creating a pull request into FiftyOne

The best way to develop features privately in this repository that you intend
to reach the public [FiftyOne](https://github.com/voxel51/fiftyone) repository
is to do your work in a branch off of `public` rather than `develop`:

```shell
git checkout public
git checkout -b my-feature

# Write, commit, etc.
```

Then open a pull request to merge `my-feature` into `public`.

Finally, to publish your feature to
[FiftyOne](https://github.com/voxel51/fiftyone), switch to your local clone of
the open source project and add this repository as a remote:

```shell
cd /path/to/public/fiftyone
git remote add teams git@github.com:voxel51/fiftyone-teams.git
git checkout -b release-to-public
git pull teams public
git push origin release-to-public
```

## Teams Developer Guide

This section describes some basic patterns you need to know when developing
Teams-specific features or migrating open source features to Teams.

### Cloud media

Remember that, unlike open source FiftyOne, Teams supports datasets backed by
cloud media:

```py
import fiftyone as fo

# This is allowed in Teams
samples = [
    fo.Sample(filepath="/path/to/image1.jpg"),
    fo.Sample(filepath="s3://path/to/image2.jpg"),
    fo.Sample(filepath="gs://path/to/image3.jpg"),
    fo.Sample(filepath="https://path/to/image4.jpg"),
]

dataset = fo.Dataset()
dataset.add_samples(samples)
```

Therefore, any builtin Teams features must be implemeneted to support both
local and cloud-backed media.

### Writing cloud-friendly code

The
[fiftyone.core.storage](https://github.com/voxel51/fiftyone-teams/blob/develop/fiftyone/core/storage.py)
module contains a number of useful utilities for writing code that works for
both local and cloud paths. These methods are designed to be drop-in
replacements for the common `os` and `eta` utilities that are prevalent in open
source FiftyOne.

#### Protecting local-only code

If a public method only supports local paths, use the pattern below to raise an
informative error message if a cloud path is provided:

```py
import fiftyone.core.storage as fos

def f(local_path):
    fos.ensure_local(local_path)
    ...
```

#### Path operations

Local-only:

```py
import os

os.path.sep
os.path.join(local_dir, *parts)

os.path.isabs(local_path)
os.path.abspath(local_path)
os.path.normpath(local_path)
os.path.abspath(os.path.expanduser(path))

os.path.exists(local_path)
os.path.isfile(local_path)
os.path.isdir(local_dir)
```

Cloud-friendly:

```py
import fiftyone.core.storage as fos

fos.sep(any_path)
fos.join(any_dir, *parts)

fos.isabs(any_path)
fos.abspath(any_path)
fos.normpath(any_path)
fos.normalize_path(any_path)

fos.exists(any_path)
fos.isfile(any_path)
fos.isdir(any_dir)
```

#### Reading/writing/listing files

Local-only:

```py
import eta.core.serial as etas
import eta.core.utils as etau

with open(local_path, "w") as f:
    f.write("Hello, world!")

with open(local_path, "r") as f:
    content = f.read()

etau.write_file("Hello, world!", local_path)
s = etau.read_file(local_path)

d = etas.load_json(local_path_or_str)
d = etas.read_json(local_path)
etas.write_json(local_path)

etau.ensure_dir(local_dir)
etau.ensure_empty_dir(local_dir)
etau.ensure_basedir(local_path)

paths = etau.list_files(local_dir, abs_paths=True, recursive=True)
paths = etau.get_glob_matches(local_glob_patt)
```

Cloud-friendly:

```py
import fiftyone.core.storage as fos

with fos.open_file(any_path, "w") as f:
    f.write("Hello, world!")

with fos.open_file(any_path, "r") as f:
    content = f.read()

fos.write_file("Hello, world!", any_path)
s = fos.read_file(any_path)

d = fos.load_json(any_path_or_str)
d = fos.read_json(any_path)
fos.write_json(any_path)

fos.ensure_dir(any_dir)
fos.ensure_empty_dir(any_dir)
fos.ensure_basedir(any_path)

paths = fos.list_files(any_dir, abs_paths=True, recursive=True)
paths = fos.get_glob_matches(any_glob_patt)
```

#### Moving files

Local-only:

```py
import eta.core.utils as etau

etau.copy_file(local_inpath, local_outpath)
etau.move_file(local_inpath, local_outpath)
etau.delete_file(local_path)

etau.copy_dir(local_indir, local_outdir)
etau.move_dir(local_indir, local_outdir)
etau.delete_dir(local_dir)

for local_inpath, local_outpath in zip(local_inpaths, local_outpaths):
    etau.copy_file(local_inpath, local_outpath)

for local_inpath, local_outpath in zip(local_inpaths, local_outpaths):
    etau.move_file(local_inpath, local_outpath)

for local_path in local_paths:
    etau.delete_file(local_path)
```

Cloud-friendly:

```py
import fiftyone.core.storage as fos

fos.copy_file(any_inpath, any_outpath)
fos.move_file(any_inpath, any_outpath)
fos.delete_file(any_path)

# These operations use thread pools when cloud files are involved
fos.copy_dir(any_indir, any_outdir)
fos.move_dir(any_indir, any_outdir)
fos.delete_dir(any_dir)

# These operations use thread pools to optimize cloud operations
fos.copy_files(any_inpaths, any_outpaths)
fos.move_files(any_inpaths, any_outpaths)
fos.delete_files(any_paths)
```

#### Wrapping local I/O functions

Local-only:

```py
# A black box function that reads/writes from strictly local paths
def f(local_inpath, local_outpath):
    pass

# A black box function that reads the contents of a srictly local directory
def g(local_dir):
    pass

# A black box function that writes arbitrary files to a strictly local directory
def h(local_dir):
    pass
```

Cloud-friendly:

```py
import fiftyone.core.storage as fos

# These context managers automatically download/upload files from/to the cloud
# if necessary. If local paths are passed, the contexts are no-ops
with fos.LocalFile(any_inpath, "r") as local_inpath:
    with fos.LocalFile(any_outpath, "w") as local_outpath:
        f(local_inpath, local_outpath)

# If `any_dir` is a cloud path, its contents are downloaded to a local
# directory when the context enters (using a thread pool), and this directory
# is deleted when the context exits
with fos.LocalDir(any_dir, "r") as local_dir:
    g(local_dir)

# If `any_dir` is a cloud path, a temporary local directory is created whose
# contents are uploaded (using a thread pool) to the cloud when context exits
with fos.LocalDir(any_dir, "w") as local_dir:
    h(local_dir)
```

#### Wrapping I/O loops

Local-only:

```py
for local_inpath in local_inpaths:
    f(local_inpath)

for local_outpath in local_outpaths:
    g(local_outpath)

for task in tasks:
    # Output path is only deduced within the loop
    local_outpath = h(task)
    g(local_outpath)
```

Cloud-friendly:

```py
import fiftyone.core.storage as fos

# If `any_inpaths` contains any cloud paths, they will be downloaded to a
# temporary local directory (using a thread pool) when the context enters and
# `local_inpaths` will contain those local paths instead
with fos.LocalFiles(any_inpaths, "r") as local_inpaths:
    for local_inpath in local_inpaths:
        f(local_inpath)

# If `any_outpaths` contains any cloud paths, they will be replaced with
# temporary local paths in `local_outpaths`. When the context exits, these
# local paths will be uploaded (using a thread pool) to the cloud destinations
with fos.LocalFiles(any_outpaths, "w") as local_outpaths:
    for local_inpath in local_inpaths:
        g(local_inpath)

# Variant of the above pattern that allows for converting cloud output paths
# to temporary local paths JIT via `get_local_path()`. As in the previous
# example, any local files are uploaded (using a thread pool) to their cloud
# destinations when the context exits
with fos.FileWriter() as writer:
    for any_inpath in any_inpaths:
        any_outpath = h(any_inpath)
        local_outpath = writer.get_local_path(any_outpath)
        g(local_outpath)
```

### Cloud imports/exports

All builtin importers/exporters in Teams must support reading/writing directly
from/to cloud paths:

```py
import fiftyone as fo
import fiftyone.zoo as foz

dataset = foz.load_zoo_dataset("quickstart")

dataset.export(
    export_dir="s3://voxel51-test/teams/quickstart",
    dataset_type=fo.types.COCODetectionDataset,
    label_field="ground_truth",
)

dataset2 = fo.Dataset.from_dir(
    data_path="s3://voxel51-test/teams/quickstart/data",
    labels_path="s3://voxel51-test/teams/quickstart/labels.json",
    label_field="ground_truth",
)
```

#### Importer tips

The `fos.list_files()` and `fos.join()` functions natively support cloud paths,
which generally provides for most of the needs that arise when writing
importers.

Local-only:

```py
import os
import eta.core.utils as etau

label_paths = etau.list_files(labels_dir, recursive=True)

label_paths_map = {
    os.path.splitext(p)[0]: os.path.join(labels_dir, p)
    for p in label_paths
}
```

Cloud-friendly:

```py
import fiftyone.core.storage as fos

label_paths = fos.list_files(labels_dir, recursive=True)

label_paths_map = {
    os.path.splitext(p)[0]: fos.join(labels_dir, p)
    for p in label_paths
}
```

In addition, if you are writing an importer for a format whose labels are
stored in per-sample files, such as `VOCDetectionDataset`, you can use
`fos.LocalFiles` to efficiently download any cloud labels to a temporary local
directory at setup time, from which the individual labels files can be read at
import time:

```py
import fiftyone.core.storage as fos
import fiftyone.utils.data as foud

class CustomDatasetImporter(foud.LabeledImageDatasetImporter):

    def setup(self):
        # Downloads any cloud labels to a temporary local directory
        self._local_files = fos.LocalFiles(label_paths, "r", type_str="labels")
        self._local_paths = local_files.__enter__()

    def __next__(self):
        # Load labels from local path
        local_path = self._local_paths[idx]

    def close(self, *args):
        # Deletes the temporary local directory, if one was created
        self._local_files.__exit__()
```

#### Exporter tips

The `foud.MediaExporter` class, which is used by most exporters to handle the
export of media files, natively supports cloud paths, so you generally do not
need to consider local vs cloud issues at all.

In addition, if you are writing an exporter that generates one labels file per
call to `export_sample()`, such as `VOCDetectionDataset`, you can leverage the
`foud.LabelsExporter` class to convert possible cloud paths to temporary local
paths on disk at sample export time so that label uploads can be deferred until
the exporter is closed, when the uploads can be efficiently batched.

```py
import fiftyone.utils.data as foud

class CustomDatasetExporter(foud.LabeledImageDatasetExporter):

    def setup(self):
        self._labels_exporter = foud.LabelsExporter()
        self._labels_exporter.setup()

    def export_sample(self, *args, **kwargs):
        # Converts possibly cloud path to an always local path
        local_path = self._labels_exporter.get_local_path(out_labels_path)

    def close(self, *args):
        # Uploads any cloud labels and deletes any temporary directory
        self._labels_exporter.close()
```

### Media cache

Certain workflows require access to the actual media files of datasets:

-   Viewing datasets in the App
-   Applying models via `apply_model()`, `compute_embeddings()`, and
    `compute_patch_embeddings()`
-   Running brain methods like `compute_visualization()` and
    `compute_similarity()`
-   Uploading data for annotation via `annotate()`
-   Rendering labels on media via `draw_labels()`

To gracefully handle local or cloud-backed datasets, Teams provides a media
cache that automatically caches cloud media locally whenever builtin methods
require access to the media. Refer to the
[Teams User Manual](https://docs.google.com/document/d/1Y4lZpMxlajj20EeIvDu7cRGPcjWwT4rTnG-vtjVilUc)
for full documentation.

Use the following patterns to write Teams code that gracefully handles both
local and cloud-backed datasets:

```py
# The actual local or cloud location of a sample's media
sample.filepath

# The list of local or cloud paths to all media in a collection
filepaths = sample_collection.values("filepath")

# If the sample's filepath is local, it will also be returned here.
# If it is in the cloud, accessing this property will cause the media to be
# downloaded to the cache if it is not already, and the local cache path will
# be returned here
sample.local_path

# Retrieves the local or locally-cached paths for all samples in a collection
# Causes any uncached cloud files to be immediately downloaded using an
# efficient threaded batch operation
local_paths = sample_collection.get_local_paths()
```

The following useful cache-related methods are also available:

```py
import fiftyone.core.cache as foc

# Current stats about the entire media cache
foc.media_cache.stats()

# Batch download all media for a sample collection
sample_collection.download_media()

# Erase all media in a sample collection from the cache
sample_collection.clear_media()

# Get stats about a sample collection's contribution to the media cache
sample_collection.cache_stats()
```
