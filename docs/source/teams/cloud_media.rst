.. _cloud-media:

Cloud-backed media Datasets
===========================

.. default-role:: code

FiftyOne Teams datasets may contain samples whose filepath refers to cloud object storage paths (e.g., ``s3://bucket/object`` or ``gs://bucket/object``) and/or publicly available URLs.

.. _cloud-media-caching:

Cloud media caching
___________________ 

When you work with cloud-backed datasets in Teams, media files will automatically be downloaded and cached on the machine you’re working from when you execute workflows such as model inference or Brain methods that require access to the pixels of the media files. This design minimizes bandwidth usage and can significantly improve performance in workflows where you access the same media file repeatedly.

By default, viewing image datasets in the App will also cache the images locally, but this can be disabled via the ``cache_app_images`` config parameter described below. Viewing video datasets in the App will never cause videos to be cached locally if they are not already cached. When viewing non-cached samples in the App, it is recommended that you populate metadata on your dataset by calling ``dataset.compute_metadata()`` before view cloud-backed datasets in the App to avoid needing to pull the metadata each time you view a sample.

By default, the media cache is located at ``~/fiftyone/__cache__``, has a size of 128GB, and will use a thread pool whose size equals the number of virtual CPU cores on your machine to download media files, but you can customize these parameters if desired (see below). When the cache is full, local files are automatically deleted in reverse order of when they were last accessed (i.e., oldest deleted first).

.. _cloud-media-python-code:

Writing Python code for cloud-backed Datasets
______________________________________________ 

When writing Python code using the Teams client that may involve cloud-backed datasets, use ``sample.local_path`` instead of ``sample.filepath`` to retrieve the location of the locally cached version of the media file. Note that, if you access ``sample.local_path`` and the corresponding media file is not cached locally, it will immediately be downloaded. If ``sample.filepath`` itself is a local path, then ``sample.local_path`` will simply return that path. In other words, it is safe to write all Teams Python code as if the dataset contains cloud-backed media.

You can use ``sample_collection.download_media()`` to efficiently download and cache the source media files for an entire sample collection using the cache’s full thread pool to maximize throughput. You can also use ``sample_collection.get_local_paths()`` as a drop-in replacement for ``sample_collection.values("filepath")`` to retrieve the list of local paths for each sample in a potentially cloud-backed dataset.

You can get information about currently cached media files for a sample collection by calling ``sample_collection.cache_stats()``, and you can call ``sample_collection.clear_media()`` to delete any cached copies of media in a specific sample collection. You can also perform these operations on the full cache as follows:


.. code-block:: python

    import fiftyone.core.cache as foc

    print(foc.media_cache.stats())
    foc.media_cache.clear()

.. _media-cache-config:

Media cache config
_____________________

You can configure the behavior of FiftyOne Team’s media cache in any of the following ways.

#. Configure your media cache on a per-session basis by setting any of the following environment variables (default values shown):
	
	|

    .. code-block:: python

        export FIFTYONE_MEDIA_CACHE_DIR=/path/for/media-cache
        export FIFTYONE_MEDIA_CACHE_SIZE_BYTES=137438953472
        export FIFTYONE_MEDIA_CACHE_NUM_WORKERS=16
        export FIFTYONE_MEDIA_CACHE_APP_IMAGES=false

#. Create a media cache config file at ``~/.fiftyone/media_cache_config.json`` that contains any of the following keys:
	
	|

    .. code-block:: python

        {
        "cache_dir": "/path/for/media-cache",
        "cache_size_bytes": 137438953472,
        "num_workers": 16,
        "cache_app_images": false
        }

    You can change the location of this file via the ``FIFTYONE_MEDIA_CACHE_CONFIG_PATH`` environment variable.


If you combine multiple options above, environment variables will take precedence over JSON config settings.



.. _annotating-cloud-media:

Annotating cloud-backed datasets with CVAT
____________________________________________

When using FiftyOne to `annotate data with CVAT <https://voxel51.com/docs/fiftyone/integrations/cvat.html>`_, you can optionally follow the instructions below to instruct CVAT to load media directly from S3, GCS, or `MinIO <https://github.com/openvinotoolkit/cvat/pull/4353>`_ buckets rather than the default behavior of uploading copies of the media to the CVAT server.

First, follow `these instructions <https://opencv.github.io/cvat/docs/manual/basics/attach-cloud-storage/>`_ to attach a cloud storage bucket to CVAT. Then, simply provide the ``cloud_manifest`` parameter to FiftyOne’s ``annotate()`` method to specify the URL of the manifest file in your cloud bucket:

.. code-block:: python
    
    anno_key = "cloud_annotations"
    results = dataset.annotate(
        anno_key,
        label_field="ground_truth",
        cloud_manifest="s3://voxel51/manifest.jsonl",
    )

Alternatively, if your ``cloud_manifest`` file follows the default name ``manifest.jsonl`` and exists in the root of the bucket containing the data in the sample collection being annotated, then you can simply provide ``cloud_manifest=True``:

.. code-block:: python
    
    results = dataset.annotate(
        anno_key,
        label_field="ground_truth",
        cloud_manifest=True,
    )

.. note::

    The cloud manifest file must contain all media files in the sample collection being annotated. For example, the collection may not also contain local filepaths.




