.. _teams-cloud-media:

Cloud-Backed Media
==================

.. default-role:: code

FiftyOne Teams datasets may contain samples whose filepath refers to cloud
object storage paths and/or publicly available URLs.

.. note::

   :ref:`Click here <teams-cloud-credentials>` to see how to configure FiftyOne
   Teams to load your cloud credentials!

.. _teams-cloud-media-caching:

Cloud media caching
___________________

When you work with cloud-backed datasets in Teams, media files will
automatically be downloaded and cached on the machine you’re working from when
you execute workflows such as model inference or Brain methods that require
access to the pixels of the media files. This design minimizes bandwidth usage
and can significantly improve performance in workflows where you access the
same media file repeatedly:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob

    dataset = fo.load_dataset("a-teams-dataset")

    # Automatically downloads cloud media to your local cache for processing
    fob.compute_visualization(dataset, brain_key="img_viz")

When launching the App locally using the Teams SDK, viewing image datasets in
the App will also cache the images locally:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset("a-teams-dataset")

    # By default, images you view in the grid will be cached locally
    session = fo.launch_app(dataset)

If desired, this can be disabled via the ``cache_app_images`` parameter of your
:ref:`media cache config <teams-media-cache-config>`. Viewing video datasets in
the App will never cause previously uncached videos to be cached locally.

.. note::

    Pro tip: we recommend that you populate the metadata on your datasets at
    creation time:

    .. code-block:: python

        dataset.compute_metadata()

    so that the dimensions of all media stored in the cloud are readily
    available when viewing datasets in the App. Otherwise, the App must pull
    this metadata each time you view a sample.

.. _teams-media-cache-config:

Media cache config
__________________

By default, your local media cache is located at ``~/fiftyone/__cache__``, has
a size of 32GB, and will use a thread pool whose size equals the number of
virtual CPU cores on your machine to download media files.

When the cache is full, local files are automatically deleted in reverse order
of when they were last accessed (i.e., oldest deleted first).

You can configure the behavior of FiftyOne Team’s media cache in any of the
following ways.

1. Configure your media cache on a per-session basis by setting any of the
following environment variables (default values shown):

.. code-block:: shell

    export FIFTYONE_MEDIA_CACHE_DIR=/path/for/media-cache
    export FIFTYONE_MEDIA_CACHE_SIZE_BYTES=137438953472
    export FIFTYONE_MEDIA_CACHE_NUM_WORKERS=16
    export FIFTYONE_MEDIA_CACHE_APP_IMAGES=false

2. Create a media cache config file at ``~/.fiftyone/media_cache_config.json``
that contains any of the following keys:

.. code-block:: json

    {
        "cache_dir": "/path/for/media-cache",
        "cache_size_bytes": 137438953472,
        "num_workers": 16,
        "cache_app_images": false
    }

You can change the location of this file via the
``FIFTYONE_MEDIA_CACHE_CONFIG_PATH`` environment variable.

If you combine multiple options above, environment variables will take
precedence over JSON config settings.

.. _teams-cloud-media-python-code:

Writing Python code for cloud-backed datasets
______________________________________________

When writing Python code using the Teams client that may involve cloud-backed
datasets, use ``sample.local_path`` instead of ``sample.filepath`` to retrieve
the location of the locally cached version of the media file:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset("a-teams-dataset")
    sample = dataset.first()

    print(sample.filepath)
    # ex: s3://voxel51-test/images/000001.jpg

    print(sample.local_path)
    # ex: ~/fiftyone/__cache__/media/s3/voxel51-test/images/000001.jpg

If ``sample.filepath`` itself is a local path, then ``sample.local_path`` will
simply return that path. In other words, it is safe to write all Teams Python
code as if the dataset contains cloud-backed media.

.. note::

    If you access ``sample.local_path`` and the corresponding media file is not
    cached locally, it will immediately be downloaded.

You can use ``download_media()`` to efficiently download and cache the source
media files for an entire dataset or view using the cache's full thread pool to
maximize throughput:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # Download media for a view
    view = dataset.shuffle().limit(10)
    view.download_media()

    # Download all media in the dataset
    dataset.download_media()

.. note::

    By default, ``download_media()`` will ignore any already cached media.

You can also use ``download_context()`` to download smaller batches of media
when iterating over samples in a collection:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset("a-teams-dataset")

    # Pre-download in batches of 50
    with dataset.download_context(batch_size=50):
        for sample in dataset:
            sample.local_path  # already downloaded

This context provides a middle ground between the following other patterns:

.. code-block:: python
    :linenos:

    # Download all media in advance
    dataset.download_media()
    for sample in dataset:
        sample.local_path  # already downloaded

    # Download individual images just in time
    for sample in dataset:
        sample.local_path   # downloads media now

.. note::

    Download contexts are useful if your cache is not large enough to store all
    the media in the collection you're working with simultaneously.

You can also use ``get_local_paths()`` to retrieve the list of local paths
for each sample in a potentially cloud-backed dataset:

.. code-block:: python
    :linenos:

    # Retrieve the local paths for all media in a collection
    local_paths = sample_collection.get_local_paths()

    print(local_paths[0])
    # ex: ~/fiftyone/__cache__/media/s3/voxel51-test/images/000001.jpg

    # Retrieve the possibly-cloud paths for all media in a collection
    cloud_paths = sample_collection.values("filepath")

    print(cloud_paths[0])
    # ex: s3://voxel51-test/images/000001.jpg

You can get information about currently cached media files for a sample
collection by calling ``cache_stats()``:

.. code-block:: python
    :linenos:

    # View cache stats for the current collection
    sample_collection.cache_stats()

.. code-block:: text

    {'cache_dir': '~/fiftyone/__cache__',
     'cache_size': 34359738368,
     'cache_size_str': '32.0GB',
     'current_size': 24412374,
     'current_size_str': '23.3MB',
     'current_count': 200,
     'load_factor': 0.000710493593942374}

and you can call ``clear_media()`` to delete any cached copies of media in the
collection:

.. code-block:: python
    :linenos:

    # Clear this collection's media from the cache
    sample_collection.clear_media()

You can also perform these operations on the full cache as follows:

.. code-block:: python
    :linenos:

    # View global cache stats
    print(fo.media_cache.stats())

.. code-block:: text

    {'cache_dir': '~/fiftyone/__cache__',
     'cache_size': 34359738368,
     'cache_size_str': '32.0GB',
     'current_size': 49097587,
     'current_size_str': '46.8MB',
     'current_count': 600,
     'load_factor': 0.0014289278478827327}

.. code-block:: python
    :linenos:

    # Clear the entire cache
    fo.media_cache.clear()

.. _teams-cloud-api-reference:

API reference
-------------

Here's the cloud-relevant methods available on ``Dataset`` and ``DatasetView``
instances:

.. code-block:: python

    import fiftyone as fo

    fo.Dataset.download_media?
    fo.Dataset.download_context?
    fo.Dataset.get_local_paths?
    fo.Dataset.cache_stats?
    fo.Dataset.clear_media?

.. code-block:: python

    fo.Dataset.download_media(
        self, media_fields=None, update=False, skip_failures=True
    ):
        """Downloads the source media files for all samples in the collection.

        This method is only useful for collections that contain remote media.

        Any existing files are not re-downloaded, unless ``update == True`` and
        their checksums no longer match.

        Args:
            media_fields (None): a field or iterable of fields containing media
                to download. By default, all media fields in the collection's
                :meth:`app_config` are used
            update (False): whether to re-download media whose checksums no
                longer match
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded
        """

.. code-block:: python

    fo.Dataset.download_context(
        self, batch_size=100, clear=False, quiet=None, **kwargs
    ):
        """Returns a context that can be used to automatically pre-download
        media when iterating over samples in this collection.

        Args:
            batch_size (100): the sample batch size to use when downloading
                media
            clear (False): whether to clear the media from the cache when the
                context exits
            quiet (None): whether to display (False) or not display (True) a
                progress bar tracking the status of any downloads. By default,
                ``fiftyone.config.show_progress_bars`` is used to set this
            **kwargs: valid keyword arguments for :meth:`download_media`

        Returns:
            a :class:`DownloadContext`
        """

.. code-block:: python

    fo.Dataset.get_local_paths(
        self, media_field="filepath", download=True, skip_failures=True
    ):
        """Returns a list of local paths to the media files in this collection.

        This method is only useful for collections that contain remote media.

        Args:
            media_field ("filepath"): the field containing the media paths
            download (True): whether to download any non-cached media files
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded

        Returns:
            a list of local filepaths
        """

.. code-block:: python

    fo.Dataset.cache_stats(self, media_fields=None):
        """Returns a dictionary of stats about the cached media files in this
        collection.

        This method is only useful for collections that contain remote media.

        Args:
            media_fields (None): a field or iterable of fields containing media
                paths. By default, all media fields in the collection's
                :meth:`app_config` are included

        Returns:
            a stats dict
        """

.. code-block:: python

    fo.Dataset.clear_media(self, media_fields=None):
        """Deletes any local copies of media files in this collection from the
        media cache.

        This method is only useful for collections that contain remote media.

        Args:
            media_fields (None): a field or iterable of fields containing media
                paths to clear from the cache. By default, all media fields
                in the collection's :meth:`app_config` are cleared
        """

The ``fiftyone.core.storage`` module also provides a number of convenient
methods that can be used to manipulate both cloud (and local) media:

.. code-block:: python

    import fiftyone.core.storage as fos

    fos.list_files?
    fos.copy_files?
    fos.move_files?
    fos.delete_files?
    fos.upload_media?

.. code-block:: python

    fos.list_files(
        dirpath,
        abs_paths=False,
        recursive=False,
        include_hidden_files=False,
        sort=True,
    ):
        """Lists the files in the given directory.

        If the directory does not exist, an empty list is returned.

        Args:
            dirpath: the path to the directory to list
            abs_paths (False): whether to return the absolute paths to the files
            recursive (False): whether to recursively traverse subdirectories
            include_hidden_files (False): whether to include dot files
            sort (True): whether to sort the list of files

        Returns:
            a list of filepaths
        """

.. code-block:: python

    fos.copy_files(inpaths, outpaths, skip_failures=False, progress=False):
        """Copies the files to the given locations.

        Args:
            inpaths: a list of input paths
            outpaths: a list of output paths
            skip_failures (False): whether to gracefully continue without
                raising an error if a remote operation fails
            progress (False): whether to render a progress bar tracking the
                status of the operation
        """

.. code-block:: python

    fos.move_files(inpaths, outpaths, skip_failures=False, progress=False):
        """Moves the files to the given locations.

        Args:
            inpaths: a list of input paths
            outpaths: a list of output paths
            skip_failures (False): whether to gracefully continue without raising
                an error if a remote operation fails
            progress (False): whether to render a progress bar tracking the status
                of the operation
        """

.. code-block:: python

    fos.delete_files(paths, skip_failures=False, progress=False):
        """Deletes the files from the given locations.

        For local paths, any empty directories are also recursively deleted from
        the resulting directory tree.

        Args:
            paths: a list of paths
            skip_failures (False): whether to gracefully continue without raising
                an error if a remote operation fails
            progress (False): whether to render a progress bar tracking the status
                of the operation
        """

.. code-block:: python

    fos.upload_media(
        sample_collection,
        remote_dir,
        rel_dir=None,
        media_field="filepath",
        update_filepaths=False,
        overwrite=False,
        skip_failures=False,
        progress=False,
    ):
        """Uploads the source media files for the given collection to the given
        remote directory.

        Providing a ``rel_dir`` enables writing nested subfolders within
        ``remote_dir`` matching the structure of the input collection's media. By
        default, the files are written directly to ``remote_dir`` using their
        basenames.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
            remote_dir: a remote "folder" into which to upload
            rel_dir (None): an optional relative directory to strip from each
                filepath when constructing the corresponding remote path
            media_field ("filepath"): the field containing the media paths
            update_filepaths (False): whether to update the ``media_field`` of each
                sample in the collection to its remote path
            overwrite (False): whether to overwrite (True) or skip (False) existing
                remote files
            skip_failures (False): whether to gracefully continue without raising
                an error if a remote operation fails
            progress (False): whether to render a progress bar tracking the status
                of the upload

        Returns:
            the list of remote paths
        """

.. _teams-annotating-cloud-media:

Annotating cloud-backed datasets with CVAT
__________________________________________

When using FiftyOne to
`annotate data with CVAT <https://voxel51.com/docs/fiftyone/integrations/cvat.html>`_,
you can optionally follow the instructions below to instruct CVAT to load media
directly from S3, GCS, or
`MinIO <https://github.com/openvinotoolkit/cvat/pull/4353>`_ buckets rather
than the default behavior of uploading copies of the media to the CVAT server.

First, follow
`these instructions <https://opencv.github.io/cvat/docs/manual/basics/attach-cloud-storage/>`_
to attach a cloud storage bucket to CVAT. Then, simply provide the
``cloud_manifest`` parameter to
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate` to
specify the URL of the manifest file in your cloud bucket:

.. code-block:: python
    :linenos:

    anno_key = "cloud_annotations"

    results = dataset.annotate(
        anno_key,
        label_field="ground_truth",
        cloud_manifest="s3://voxel51/manifest.jsonl",
    )

Alternatively, if your cloud manifest has the default name ``manifest.jsonl``
and exists in the root of the bucket containing the data in the sample
collection being annotated, then you can simply pass ``cloud_manifest=True``:

.. code-block:: python
    :linenos:

    results = dataset.annotate(
        anno_key,
        label_field="ground_truth",
        cloud_manifest=True,
    )

.. note::

    The cloud manifest file must contain all media files in the sample
    collection being annotated.

.. _teams-cloud-functions:

AWS Lambda and Google Cloud Functions
_____________________________________

FiftyOne Teams can easily be used in AWS Lambda Functions and Google Cloud
Functions.

**Requirements**

We recommend including Teams in your  function’s ``requirements.txt`` file by
passing your token as a build environment variable, e.g.,
``FIFTYONE_TEAMS_TOKEN`` and then using the syntax below to specify the version
of the Teams client to use:

.. code-block:: text

    https://${FIFTYONE_TEAMS_TOKEN}@pypi.fiftyone.ai/packages/fiftyone-0.6.6-py3-none-any.whl

**Runtime**

Lambda/GCFs cannot use services, so you must disable the media the cache by
setting the following runtime environment variable:

.. code-block:: shell

    export FIFTYONE_MEDIA_CACHE_SIZE_BYTES=-1  # disable media cache

From there, you can configure your database URI and any necessary cloud storage
credentials via runtime environment variables as you normally would, eg:

.. code-block:: shell

    export FIFTYONE_DATABASE_URI=mongodb://...
