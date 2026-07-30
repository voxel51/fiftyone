.. _brain-similarity:

Similarity Search
==================

.. default-role:: code

.. customavailablein::
    :oss_version: 0.9.0
    :enterprise_version: 1.0

The FiftyOne Brain provides a
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` method that
you can use to index the images or object patches in a dataset by similarity.

Once you've indexed a dataset by similarity, you can use the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to programmatically sort your dataset by similarity to any image(s)
or object patch(es) of your choice in your dataset. In addition, the App
provides a convenient :ref:`point-and-click interface <app-similarity>` for
sorting by similarity with respect to an index on a dataset.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using similarity
    indexes!

Embedding methods
-----------------

Like :ref:`embeddings visualization <brain-embeddings-visualization>`,
similarity leverages deep embeddings to generate an index for a dataset.

The `embeddings` and `model` parameters of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` support a
variety of ways to generate embeddings for your data:

-   Provide nothing, in which case a default general purpose model is used to
    index your data
-   Provide a |Model| instance or the name of any model from the
    :ref:`Model Zoo <model-zoo>` that supports embeddings
-   Provide your own precomputed embeddings in array form
-   Provide the name of a |VectorField| or |ArrayField| of your dataset in
    which precomputed embeddings are stored

.. _brain-similarity-backends:

Similarity backends
-------------------

By default, all similarity indexes are served using a builtin
`scikit-learn <https://scikit-learn.org>`_ backend, but you can pass the
optional `backend` parameter to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to switch to
another supported backend:

-   **sklearn** (*default*): a `scikit-learn <https://scikit-learn.org>`_ backend
-   **qdrant**: a :ref:`Qdrant backend <qdrant-integration>`
-   **redis**: a :ref:`Redis backend <redis-integration>`
-   **pinecone**: a :ref:`Pinecone backend <pinecone-integration>`
-   **mongodb**: a :ref:`MongoDB backend <mongodb-integration>`
-   **elasticsearch**: a :ref:`Elasticsearch backend <elasticsearch-integration>`
-   **pgvector**: a :ref:`PostgreSQL Pgvector backend <pgvector-integration>`
-   **mosaic**: a :ref:`Databricks Mosaic AI backend <mosaic-integration>`
-   **milvus**: a :ref:`Milvus backend <milvus-integration>`
-   **lancedb**: a :ref:`LanceDB backend <lancedb-integration>`

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    results = fob.compute_similarity(
        dataset,
        backend="sklearn",  # "sklearn", "qdrant", "redis", etc
        brain_key="...",
        ...
    )

.. note::

    Refer to :ref:`this section <brain-similarity-api>` for more information
    about creating, managing and deleting similarity indexes.

.. _brain-image-similarity:

Image similarity
----------------

This section demonstrates the basic workflow of:

-   Indexing an image dataset by similarity
-   Using the App's :ref:`image similarity <app-image-similarity>` UI to query
    by visual similarity
-   Using the SDK's
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
    view stage to programmatically query the index

To index a dataset by image similarity, pass the |Dataset| or |DatasetView| of
interest to :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
along with a name for the index via the `brain_key` argument.

Next load the dataset in the App and select some image(s). Whenever there is
an active selection in the App, a :ref:`similarity icon <app-image-similarity>`
will appear above the grid, enabling you to sort by similarity to your current
selection.

You can use the :ref:`Similarity Search panel <app-similarity-search-panel>` for
advanced search options, run management, and search history.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Index images by similarity
    fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="img_sim",
    )

    session = fo.launch_app(dataset)

.. note::

    In the example above, we specify a :ref:`zoo model <model-zoo>` with which
    to generate embeddings, but you can also provide
    :ref:`precomputed embeddings <brain-similarity-api>`.

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

Alternatively, you can use the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to programmatically :ref:`construct a view <using-views>` that
contains the sorted results:

.. code-block:: python
    :linenos:

    # Choose a random image from the dataset
    query_id = dataset.take(1).first().id

    # Programmatically construct a view containing the 15 most similar images
    view = dataset.sort_by_similarity(query_id, k=15, brain_key="img_sim")

    session.view = view

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. note::

    For large datasets, you may notice longer load times the first time you use
    a similarity index in a session. Subsequent similarity searches will use
    cached results and will be faster!

.. _brain-object-similarity:

Object similarity
-----------------

This section demonstrates the basic workflow of:

-   Indexing a dataset of objects by similarity
-   Using the App's :ref:`object similarity <app-object-similarity>` UI to
    query by visual similarity
-   Using the SDK's
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
    view stage to programmatically query the index

You can index any objects stored on datasets in |Detection|, |Detections|,
|Polyline|, or |Polylines| format. See :ref:`this section <using-labels>` for
more information about adding labels to your datasets.

To index by object patches, simply pass the |Dataset| or |DatasetView| of
interest to :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
along with the name of the patches field and a name for the index via the
`brain_key` argument.

Next load the dataset in the App and switch to
:ref:`object patches view <app-object-patches>` by clicking the patches icon
above the grid and choosing the label field of interest from the dropdown.

Now whenever you have selected one or more patches in the App, a
:ref:`similarity icon <app-object-similarity>` will appear above the grid,
enabling you to sort by similarity to your current selection.

You can also use the :ref:`Similarity Search panel <app-similarity-search-panel>` for
advanced search options, run management, and search history.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Index ground truth objects by similarity
    fob.compute_similarity(
        dataset,
        patches_field="ground_truth",
        model="clip-vit-base32-torch",
        brain_key="gt_sim",
    )

    session = fo.launch_app(dataset)

.. note::

    In the example above, we specify a :ref:`zoo model <model-zoo>` with which
    to generate embeddings, but you can also provide
    :ref:`precomputed embeddings <brain-similarity-api>`.

.. image:: /images/brain/brain-object-similarity.gif
   :alt: object-similarity
   :align: center

Alternatively, you can directly use the
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
view stage to programmatically :ref:`construct a view <using-views>` that
contains the sorted results:

.. code-block:: python
    :linenos:

    # Convert to patches view
    patches = dataset.to_patches("ground_truth")

    # Choose a random patch object from the dataset
    query_id = patches.take(1).first().id

    # Programmatically construct a view containing the 15 most similar objects
    view = patches.sort_by_similarity(query_id, k=15, brain_key="gt_sim")

    session.view = view

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains objects that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the objects of
    interest.

.. note::

    For large datasets, you may notice longer load times the first time you use
    a similarity index in a session. Subsequent similarity searches will use
    cached results and will be faster!

.. _brain-similarity-text:

Text similarity
---------------

.. customavailablein::
    :oss_version: 0.20.0
    :enterprise_version: 1.2

When you create a similarity index powered by the
:ref:`CLIP model <model-zoo-clip-vit-base32-torch>`, you can also search by
arbitrary natural language queries
:ref:`natively in the App <app-text-similarity>`, including via the
:ref:`Similarity Search panel <app-similarity-search-panel>`!

.. tabs::

  .. group-tab:: Image similarity

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.brain as fob
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        # Index images by similarity
        image_index = fob.compute_similarity(
            dataset,
            model="clip-vit-base32-torch",
            brain_key="img_sim",
        )

        session = fo.launch_app(dataset)

    You can verify that an index supports text queries by checking that it
    `supports_prompts`:

    .. code-block:: python
        :linenos:

        # If you have already loaded the index
        print(image_index.config.supports_prompts)  # True

        # Without loading the index
        info = dataset.get_brain_info("img_sim")
        print(info.config.supports_prompts)  # True

  .. group-tab:: Object similarity

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.brain as fob
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        # Index ground truth objects by similarity
        object_index = fob.compute_similarity(
            dataset,
            patches_field="ground_truth",
            model="clip-vit-base32-torch",
            brain_key="gt_sim",
        )

        session = fo.launch_app(dataset)

    You can verify that an index supports text queries by checking that it
    `supports_prompts`:

    .. code-block:: python
        :linenos:

        # If you have already loaded the index
        print(object_index.config.supports_prompts)  # True

        # Without loading the index
        info = dataset.get_brain_info("gt_sim")
        print(info.config.supports_prompts)  # True

.. image:: /images/brain/brain-text-similarity.gif
   :alt: text-similarity
   :align: center

You can also perform text queries via the SDK by passing a prompt directly to
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
along with the `brain_key` of a compatible similarity index:

.. tabs::

  .. group-tab:: Image similarity

    .. code-block:: python
        :linenos:

        # Perform a text query
        query = "kites high in the air"
        view = dataset.sort_by_similarity(query, k=15, brain_key="img_sim")

        session.view = view

  .. group-tab:: Object similarity

    .. code-block:: python
        :linenos:

        # Convert to patches view
        patches = dataset.to_patches("ground_truth")

        # Perform a text query
        query = "cute puppies"
        view = patches.sort_by_similarity(query, k=15, brain_key="gt_sim")

        session.view = view

.. note::

    In general, any custom model that is made available via the
    :ref:`model zoo interface <model-zoo-add>` that implements the
    :class:`PromptMixin <fiftyone.core.models.PromptMixin>` interface can
    support text similarity queries!

.. _brain-similarity-api:

Similarity API
--------------

This section describes how to setup, create, and manage similarity indexes in
detail.

Changing your similarity backend
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can use a specific backend for a particular similarity index by passing the
`backend` parameter to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    index = fob.compute_similarity(..., backend="<backend>", ...)

Alternatively, you can change your default similarity backend for an entire
session by setting the `FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND` environment
variable.

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=<backend>

Finally, you can permanently change your default similarity backend by
updating the `default_similarity_backend` key of your
:ref:`brain config <brain-config>` at `~/.fiftyone/brain_config.json`:

.. code-block:: text

    {
        "default_similarity_backend": "<backend>",
        "similarity_backends": {
            "<backend>": {...},
            ...
        }
    }

Configuring your backend
~~~~~~~~~~~~~~~~~~~~~~~~

Similarity backends may be configured in a variety of backend-specific ways,
which you can see by inspecting the parameters of a backend's associated
|SimilarityConfig| class.

The relevant classes for the builtin similarity backends are:

-   **sklearn**: :class:`fiftyone.brain.internal.core.sklearn.SklearnSimilarityConfig`
-   **qdrant**: :class:`fiftyone.brain.internal.core.qdrant.QdrantSimilarityConfig`
-   **redis**: :class:`fiftyone.brain.internal.core.redis.RedisSimilarityConfig`
-   **pinecone**: :class:`fiftyone.brain.internal.core.pinecone.PineconeSimilarityConfig`
-   **mongodb**: :class:`fiftyone.brain.internal.core.mongodb.MongoDBSimilarityConfig`
-   **elasticsearch**: :class:`fiftyone.brain.internal.core.elasticsearch.ElasticsearchSimilarityConfig`
-   **pgvector**: :class:`fiftyone.brain.internal.core.pgvector.PgVectorSimilarityConfig`
-   **mosaic**: :class:`fiftyone.brain.internal.core.mosaic.MosaicSimilarityConfig`
-   **milvus**: :class:`fiftyone.brain.internal.core.milvus.MilvusSimilarityConfig`
-   **lancedb**: :class:`fiftyone.brain.internal.core.lancedb.LanceDBSimilarityConfig`

You can configure a similarity backend's parameters for a specific index by
simply passing supported config parameters as keyword arguments each time you
call :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    index = fob.compute_similarity(
        ...
        backend="qdrant",
        url="http://localhost:6333",
    )

Alternatively, you can more permanently configure your backend(s) via your
:ref:`brain config <brain-config>`.

Creating an index
~~~~~~~~~~~~~~~~~

The :meth:`compute_similarity() <fiftyone.brain.compute_similarity>` method
provides a number of different syntaxes for initializing a similarity index.
Let's see some common patterns on the quickstart dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

Default behavior
^^^^^^^^^^^^^^^^

With no arguments, embeddings will be automatically computed for all images or
patches in the dataset using a default model and added to a new index in your
default backend:

.. tabs::

  .. group-tab:: Image similarity

    .. code:: python
        :linenos:

        tmp_index = fob.compute_similarity(dataset, brain_key="tmp")

        print(tmp_index.config.method)  # 'sklearn'
        print(tmp_index.config.model)  # 'mobilenet-v2-imagenet-torch'
        print(tmp_index.total_index_size)  # 200

        dataset.delete_brain_run("tmp")

  .. group-tab:: Object similarity

    .. code:: python
        :linenos:

        tmp_index = fob.compute_similarity(
            dataset,
            patches_field="ground_truth",   # field containing objects of interest
            brain_key="tmp",
        )

        print(tmp_index.config.method)  # 'sklearn'
        print(tmp_index.config.model)  # 'mobilenet-v2-imagenet-torch'
        print(tmp_index.total_index_size)  # 1232

        dataset.delete_brain_run("tmp")

Custom model, custom backend, add embeddings later
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

With the syntax below, we're specifying a similarity backend of our choice,
specifying a custom model from the :ref:`Model Zoo <model-zoo>` to use to
generate embeddings, and using the `embeddings=False` syntax to create
the index without initially adding any embeddings to it:

.. tabs::

  .. group-tab:: Image similarity

    .. code:: python
        :linenos:

        image_index = fob.compute_similarity(
            dataset,
            model="clip-vit-base32-torch",  # custom model
            embeddings=False,               # add embeddings later
            backend="sklearn",              # custom backend
            brain_key="img_sim",
        )

        print(image_index.total_index_size)  # 0

  .. group-tab:: Object similarity

    .. code:: python
        :linenos:

        object_index = fob.compute_similarity(
            dataset,
            patches_field="ground_truth",   # field containing objects of interest
            model="clip-vit-base32-torch",  # custom model
            embeddings=False,               # add embeddings later
            backend="sklearn",              # custom backend
            brain_key="gt_sim",
        )

        print(object_index.total_index_size)  # 0

Precomputed embeddings
^^^^^^^^^^^^^^^^^^^^^^

You can pass precomputed image or object embeddings to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` via the
`embeddings` argument:

.. tabs::

  .. group-tab:: Image similarity

    .. code:: python
        :linenos:

        model = foz.load_zoo_model("clip-vit-base32-torch")
        embeddings = dataset.compute_embeddings(model)

        tmp_index = fob.compute_similarity(
            dataset,
            model="clip-vit-base32-torch",  # store model's name for future use
            embeddings=embeddings,          # precomputed image embeddings
            brain_key="tmp",
        )

        print(tmp_index.total_index_size)  # 200

        dataset.delete_brain_run("tmp")

  .. group-tab:: Object similarity

    .. code:: python
        :linenos:

        model = foz.load_zoo_model("clip-vit-base32-torch")
        embeddings = dataset.compute_patch_embeddings(model, "ground_truth")

        tmp_index = fob.compute_similarity(
            dataset,
            patches_field="ground_truth",   # field containing objects of interest
            model="clip-vit-base32-torch",  # store model's name for future use
            embeddings=embeddings,          # precomputed patch embeddings
            brain_key="tmp",
        )

        print(tmp_index.total_index_size)  # 1232

        dataset.delete_brain_run("tmp")

Adding embeddings to an index
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
to add new embeddings or overwrite existing embeddings in an index at any time:

.. tabs::

  .. group-tab:: Image similarity

    .. code:: python
        :linenos:

        image_index = dataset.load_brain_results("img_sim")
        print(image_index.total_index_size)  # 0

        view1 = dataset[:100]
        view2 = dataset[100:]

        #
        # Approach 1: use the index to compute embeddings for `view1`
        #

        embeddings, sample_ids, _ = image_index.compute_embeddings(view1)
        image_index.add_to_index(embeddings, sample_ids)
        print(image_index.total_index_size)  # 100

        #
        # Approach 2: manually compute embeddings for `view2`
        #

        model = image_index.get_model()  # the index's model
        embeddings = view2.compute_embeddings(model)
        sample_ids = view2.values("id")
        image_index.add_to_index(embeddings, sample_ids)
        print(image_index.total_index_size)  # 200

        # Must save after edits when using the sklearn backend
        image_index.save()

  .. group-tab:: Object similarity

    When working with object embeddings, you must provide the sample ID and
    label ID for each embedding you add to the index:

    .. code:: python
        :linenos:

        import numpy as np

        object_index = dataset.load_brain_results("gt_sim")
        print(object_index.total_index_size)  # 0

        view1 = dataset[:100]
        view2 = dataset[100:]

        #
        # Approach 1: use the index to compute embeddings for `view1`
        #

        embeddings, sample_ids, label_ids = object_index.compute_embeddings(view1)
        object_index.add_to_index(embeddings, sample_ids, label_ids=label_ids)
        print(object_index.total_index_size)  # 471

        #
        # Approach 2: manually compute embeddings for `view2`
        #

        # Manually load the index's model
        model = object_index.get_model()

        # Compute patch embeddings
        _embeddings = view2.compute_patch_embeddings(model, "ground_truth")
        _label_ids = dict(zip(*view2.values(["id", "ground_truth.detections.id"])))

        # Organize into correct format
        embeddings = []
        sample_ids = []
        label_ids = []
        for sample_id, patch_embeddings in _embeddings.items():
            patch_ids = _label_ids[sample_id]
            if not patch_ids:
                continue

            for embedding, label_id in zip(patch_embeddings, patch_ids):
                embeddings.append(embedding)
                sample_ids.append(sample_id)
                label_ids.append(label_id)

        object_index.add_to_index(
            np.stack(embeddings),
            np.array(sample_ids),
            label_ids=np.array(label_ids),
        )
        print(object_index.total_index_size)  # 1232

        # Must save after edits when using the sklearn backend
        object_index.save()

.. note::

    When using the default ``sklearn`` backend, you must manually call
    :meth:`save() <fiftyone.brain.similarity.SimilarityIndex.save>` after
    adding or removing embeddings from an index in order to save the index to
    the database. This is not required when using external vector databases
    like :ref:`Qdrant <qdrant-integration>`.

.. note::

    Did you know? If you provided the name of a :ref:`zoo model <model-zoo>`
    when creating the similarity index, you can use
    :meth:`get_model() <fiftyone.brain.similarity.SimilarityIndex.get_model>`
    to load the model later. Or, you can use
    :meth:`compute_embeddings() <fiftyone.brain.similarity.SimilarityIndex.compute_embeddings>`
    to conveniently generate embeddings for new samples/objects using the
    index's model.

Retrieving embeddings in an index
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve the embeddings for any or all IDs of interest from an existing
index:

.. tabs::

  .. group-tab:: Image similarity

    .. code:: python
        :linenos:

        ids = dataset.take(50).values("id")
        embeddings, sample_ids, _ = image_index.get_embeddings(sample_ids=ids)

        print(embeddings.shape)  # (50, 512)
        print(sample_ids.shape)  # (50,)

  .. group-tab:: Object similarity

    When working with object embeddings, you can provide either sample IDs or
    label IDs for which you want to retrieve embeddings:

    .. code:: python
        :linenos:

        from fiftyone import ViewField as F

        ids = (
            dataset
            .filter_labels("ground_truth", F("label") == "person")
            .values("ground_truth.detections.id", unwind=True)
        )

        embeddings, sample_ids, label_ids = object_index.get_embeddings(label_ids=ids)

        print(embeddings.shape)  # (378, 512)
        print(sample_ids.shape)  # (378,)
        print(label_ids.shape)  # (378,)

Removing embeddings from an index
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can use
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to delete embeddings from an index by their ID:

.. tabs::

  .. group-tab:: Image similarity

    .. code:: python
        :linenos:

        ids = dataset.take(50).values("id")

        image_index.remove_from_index(sample_ids=ids)
        print(image_index.total_index_size)  # 150

        # Must save after edits when using the sklearn backend
        image_index.save()

  .. group-tab:: Object similarity

    When working with object embeddings, you can provide either sample IDs or
    label IDs for which you want to delete embeddings:

    .. code:: python
        :linenos:

        from fiftyone import ViewField as F

        ids = (
            dataset
            .filter_labels("ground_truth", F("label") == "person")
            .values("ground_truth.detections.id", unwind=True)
        )

        object_index.remove_from_index(label_ids=ids)
        print(object_index.total_index_size)  # 854

        # Must save after edits when using the sklearn backend
        object_index.save()

.. note::

    When using the default ``sklearn`` backend, you must manually call
    :meth:`save() <fiftyone.brain.similarity.SimilarityIndex.save>` after
    adding or removing embeddings from an index in order to save the index to
    the database.

    This is not required when using external vector databases like
    :ref:`Qdrant <qdrant-integration>`.

Deleting an index
~~~~~~~~~~~~~~~~~

When working with backends like :ref:`Qdrant <qdrant-integration>` that
leverage external vector databases, you can call
:meth:`cleanup() <fiftyone.brain.similarity.SimilarityIndex.cleanup>` to delete
the external index/collection:

.. tabs::

  .. group-tab:: Image similarity

    .. code:: python
        :linenos:

        # First delete the index from the backend (if applicable)
        image_index.cleanup()

        # Now delete the index from your dataset
        dataset.delete_brain_run("img_sim")

  .. group-tab:: Object similarity

    .. code:: python
        :linenos:

        # First delete the index from the backend (if applicable)
        object_index.cleanup()

        # Now delete the index from your dataset
        dataset.delete_brain_run("gt_sim")

.. note::

    Calling
    :meth:`cleanup() <fiftyone.brain.similarity.SimilarityIndex.cleanup>` has
    no effect when working with the default sklearn backend. The index is
    deleted only when you call
    :meth:`delete_brain_run() <fiftyone.core.collections.SampleCollection.delete_brain_run>`.

.. _brain-similarity-applications:

Applications
------------

How can similarity be used in practice? A common pattern is to mine your
dataset for similar examples to certain images or object patches of interest,
e.g., those that represent failure modes of a model that need to be studied in
more detail or underrepresented classes that need more training examples.

Here are a few of the many possible applications:

-   Pruning :ref:`near-duplicate images <brain-near-duplicates>` from your
    training dataset
-   Identifying failure patterns of a model
-   Finding examples of target scenarios in your data lake
-   Mining hard examples for your evaluation pipeline
-   Recommending samples from your data lake for classes that need additional
    training data

