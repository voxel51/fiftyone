.. _elasticsearch-integration:

Elasticsearch Integration
=========================

.. default-role:: code

`Elasticsearch <https://www.elastic.co/enterprise-search/vector-search>`_ is
one of the most popular search platforms available, and we've made it easy to
use Elasticsearch's vector search capabilities on your computer vision data
directly from FiftyOne!

Follow these :ref:`simple instructions <elasticsearch-setup>` to get started
using Elasticsearch + FiftyOne.

FiftyOne provides an API to create Elasticsearch indexes, upload vectors, and run
similarity queries, both :ref:`programmatically <elasticsearch-query>` in Python and
via point-and-click in the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using Elasticsearch
    similarity indexes!

.. image:: /images/brain/brain-image-similarity.gif
   :alt: image-similarity
   :align: center

.. _elasticsearch-basic-recipe:

Basic recipe
____________

The basic workflow to use Elasticsearch to create a similarity index on your FiftyOne
datasets and use this to query your data is as follows:

1)  Connect to or start an Elasticsearch server

2)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

3)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

4)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    method to generate a Elasticsearch similarity index for the samples or object
    patches in a dataset by setting the parameter `backend="elasticsearch"` and
    specifying a `brain_key` of your choice

5)  Use this Elasticsearch similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

6) If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must have access to
    `an Elasticsearch server <https://www.elastic.co/guide/en/elasticsearch/reference/current/install-elasticsearch.html>`_
    and install the
    `Elasticsearch Python client <https://www.elastic.co/guide/en/elasticsearch/client/python-api/current/index.html>`_
    to run this example:

    .. code-block:: shell

        pip install elasticsearch

    Note that, if you are using a custom Elasticsearch server, you can store your
    credentials as described in :ref:`this section <elasticsearch-setup>` to avoid
    entering them manually each time you interact with your Elasticsearch index.

First let's load a dataset into FiftyOne and compute embeddings for the samples:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    elasticsearch_index = fob.compute_similarity(
        dataset,
        brain_key="elasticsearch_index",
        backend="elasticsearch",
    )

Once the similarity index has been generated, we can query our data in FiftyOne
by specifying the `brain_key`:

.. code-block:: python
    :linenos:

    # Step 4: Query your data
    query = dataset.first().id  # query by sample ID
    view = dataset.sort_by_similarity(
        query,
        brain_key="elasticsearch_index",
        k=10,  # limit to 10 most similar samples
    )

    # Step 5 (optional): Cleanup

    # Delete the Elasticsearch index
    elasticsearch_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("elasticsearch_index")

.. note::

    Skip to :ref:`this section <elasticsearch-examples>` for a variety of common
    Elasticsearch query patterns.

.. _elasticsearch-setup:

Setup
_____

The easiest way to get started with Elasticsearch is to
`install locally via Docker <https://www.elastic.co/guide/en/elasticsearch/reference/current/getting-started.html#run-elasticsearch>`_.

Installing the Elasticsearch client
-----------------------------------

In order to use the Elasticsearch backend, you must also install the
`Elasticsearch Python client <https://www.elastic.co/guide/en/elasticsearch/client/python-api/current/getting-started-python.html>`_:

.. code-block:: shell

    pip install elasticsearch

Using the Elasticsearch backend
------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the Elasticsearch backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to `"elasticsearch"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="elasticsearch", ...)

Alternatively, you can permanently configure FiftyOne to use the Elasticsearch backend
by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=elasticsearch

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "elasticsearch"
    }

Authentication
--------------

If you are using a custom Elasticsearch server, you can provide your credentials in a
`variety of ways. <https://www.elastic.co/guide/en/elasticsearch/client/python-api/current/connecting.html#connecting>`_

**Environment variables (recommended)**

The recommended way to configure your Elasticsearch credentials is to store them in
the environment variables shown below, which are automatically accessed by
FiftyOne whenever a connection to Elasticsearch is made.

.. code-block:: shell

    export FIFTYONE_BRAIN_SIMILARITY_ELASTICSEARCH_HOSTS=https://localhost:9200
    export FIFTYONE_BRAIN_SIMILARITY_ELASTICSEARCH_USERNAME=XXXXXXXX
    export FIFTYONE_BRAIN_SIMILARITY_ELASTICSEARCH_PASSWORD=XXXXXXXX
    export FIFTYONE_BRAIN_SIMILARITY_ELASTICSEARCH_SSL_ASSERT_FINGERPRINT=XXXXXXXX

This is only one example of variables that can be used to authenticate an
Elasticsearch client. Find more information
`here. <https://www.elastic.co/guide/en/elasticsearch/client/python-api/current/connecting.html#connecting>`_

**FiftyOne Brain config**

You can also store your credentials in your :ref:`brain config <brain-config>`
located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "similarity_backends": {
            "elasticsearch": {
                "hosts": "https://localhost:9200",
                "username": "XXXXXXXX",
                "password": "XXXXXXXX",
                "ssl_assert_fingerprint": "XXXXXXXX",
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide credentials as keyword arguments each time you call
methods like :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
that require connections to Elasticsearch:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    elasticsearch_index = fob.compute_similarity(
        ...
        backend="elasticsearch",
        brain_key="elasticsearch_index",
        hosts="https://localhost:9200",
        username="XXXXXXXX",
        password="XXXXXXXX",
        ssl_assert_fingerprint="XXXXXXXX",
    )

Note that, when using this strategy, you must manually provide the credentials
when loading an index later via
:meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`:

.. code:: python
    :linenos:

    elasticsearch_index = dataset.load_brain_results(
        "elasticsearch_index",
        url="http://localhost:6333",
        hosts="https://localhost:9200",
        username="XXXXXXXX",
        password="XXXXXXXX",
        ssl_assert_fingerprint="XXXXXXXX",
    )

.. _elasticsearch-config-parameters:

Elasticsearch config parameters
-------------------------------

The Elasticsearch backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters broadly fall into four
categories:

-   **index_name** (*None*): the name of the Elasticsearch vector search index to use
    or create. If not specified, a new unique name is generated automatically
-   **metric** (*"cosine"*): the distance/similarity metric to use when
    creating a new index. The supported values are
    ``("cosine", "dotproduct", "euclidean", "innerproduct")``

For detailed information on these parameters, see the
`Elasticsearch documentation <https://www.elastic.co/guide/en/elasticsearch/reference/current/dense-vector.html#dense-vector-similarity>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`
that includes all of the available parameters:

.. code-block:: json

    {
        "similarity_backends": {
            "elasticsearch": {
                "index_name": "your-index",
                "metric": "cosine"
            }
        }
    }

However, typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    elasticsearch_index = fob.compute_similarity(
        ...
        backend="elasticsearch",
        brain_key="elasticsearch_index",
        index_name="your-index",
        metric="cosine",
    )

.. _elasticsearch-managing-brain-runs:

Managing brain runs
___________________

FiftyOne provides a variety of methods that you can use to manage brain runs.

For example, you can call
:meth:`list_brain_runs() <fiftyone.core.collections.SampleCollection.list_brain_runs>`
to see the available brain keys on a dataset:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    # List all brain runs
    dataset.list_brain_runs()

    # Only list similarity runs
    dataset.list_brain_runs(type=fob.Similarity)

    # Only list specific similarity runs
    dataset.list_brain_runs(
        type=fob.Similarity,
        patches_field="ground_truth",
        supports_prompts=True,
    )

Or, you can use
:meth:`get_brain_info() <fiftyone.core.collections.SampleCollection.get_brain_info>`
to retrieve information about the configuration of a brain run:

.. code:: python
    :linenos:

    info = dataset.get_brain_info(brain_key)
    print(info)

Use :meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`
to load the |SimilarityIndex| instance for a brain run.

You can use
:meth:`rename_brain_run() <fiftyone.core.collections.SampleCollection.rename_brain_run>`
to rename the brain key associated with an existing similarity results run:

.. code:: python
    :linenos:

    dataset.rename_brain_run(brain_key, new_brain_key)

Finally, you can use
:meth:`delete_brain_run() <fiftyone.core.collections.SampleCollection.delete_brain_run>`
to delete the record of a similarity index computation from your FiftyOne
dataset:

.. code:: python
    :linenos:

    dataset.delete_brain_run(brain_key)

.. note::

    Calling
    :meth:`delete_brain_run() <fiftyone.core.collections.SampleCollection.delete_brain_run>`
    only deletes the **record** of the brain run from your FiftyOne dataset; it
    will not delete any associated Elasticsearch index, which you can do as
    follows:

    .. code:: python

        # Delete the Elasticsearch index
        elasticsearch_index = dataset.load_brain_results(brain_key)
        elasticsearch_index.cleanup()

.. _elasticsearch-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on
a FiftyOne dataset using the Elasticsearch backend.

.. note::

    All of the examples below assume you have configured your Elasticsearch server
    as described in :ref:`this section <elasticsearch-setup>`.

.. _elasticsearch-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new Elasticsearch similarity index, you need to specify
either the `embeddings` or `model` argument to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`. Here's a few
possibilities:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    model_name = "clip-vit-base32-torch"
    model = foz.load_zoo_model(model_name)
    brain_key = "elasticsearch_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        backend="elasticsearch",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model,
        backend="elasticsearch",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        backend="elasticsearch",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    dataset.compute_embeddings(model, embeddings_field="embeddings")
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",
        backend="elasticsearch",
        brain_key=brain_key,
    )

.. _elasticsearch-patch-similarity-index:

Create a patch similarity index
-------------------------------

You can also create a similarity index for
:ref:`object patches <brain-object-similarity>` within your dataset by
including the `patches_field` argument to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset,
        patches_field="ground_truth",
        model="clip-vit-base32-torch",
        backend="elasticsearch",
        brain_key="elasticsearch_patches",
    )

.. _elasticsearch-connect-to-existing-index:

Connect to an existing index
----------------------------

If you have already created a Elasticsearch index storing the embedding vectors
for the samples or patches in your dataset, you can connect to it by passing
the `index_name` to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",      # zoo model used (if applicable)
        embeddings=False,                   # don't compute embeddings
        index_name="your-index",            # the existing Elasticsearch index
        brain_key="elasticsearch_index",
        backend="elasticsearch",
    )

.. _elasticsearch-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing Elasticsearch index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the Elasticsearch index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    elasticsearch_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="elasticsearch_index",
        backend="elasticsearch",
    )
    print(elasticsearch_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    elasticsearch_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    elasticsearch_index.add_to_index(embeddings, sample_ids)

    print(elasticsearch_index.total_index_size)  # 210

.. _elasticsearch-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a Elasticsearch index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    elasticsearch_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="elasticsearch_index",
        backend="elasticsearch",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = elasticsearch_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = elasticsearch_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _elasticsearch-query:

Querying a Elasticsearch index
-------------------------------

You can query a Elasticsearch index by appending a
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
stage to any dataset or view. The query can be any of the following:

*   An ID (sample or patch)
*   A query vector of same dimension as the index
*   A list of IDs (samples or patches)
*   A text prompt (if :ref:`supported by the model <brain-similarity-text>`)

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="elasticsearch_index",
        backend="elasticsearch",
    )

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="elasticsearch_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="elasticsearch_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="elasticsearch_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="elasticsearch_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. _elasticsearch-access-client:

Accessing the Elasticsearch client
----------------------------------

You can use the `client` property of a Elasticsearch index to directly access the
underlying Elasticsearch client instance and use its methods as desired:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    elasticsearch_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="elasticsearch_index",
        backend="elasticsearch",
    )

    elasticsearch_client = elasticsearch_index.client
    print(elasticsearch_client)

.. _elasticsearch-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <elasticsearch-config-parameters>`, you can customize
your Elasticsearch indexes by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

Here's an example of creating a similarity index backed by a customized Elasticsearch
index. Just for fun, we'll specify a custom index name, use dot
product similarity, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom Elasticsearch index
    elasticsearch_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings=False,  # we'll add embeddings below
        metric="dotproduct",
        brain_key="elasticsearch_index",
        backend="elasticsearch",
        index_name="custom-quickstart-index",
    )

    # Add embeddings for a subset of the dataset
    view = dataset.take(10)
    embeddings, sample_ids, _ = elasticsearch_index.compute_embeddings(view)
    elasticsearch_index.add_to_index(embeddings, sample_ids)

    elasticsearch_client = elasticsearch_index.client
