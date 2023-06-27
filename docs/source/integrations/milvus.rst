.. _milvus-integration:

Milvus Integration
====================

.. default-role:: code

`Milvus <https://milvus.io/>`_ is one of the most popular vector databases available, and we've made it easy to use Milvus's vector search
capabilities on your computer vision data directly from FiftyOne!

Follow these :ref:`simple instructions <milvus-setup>` to get started using Milvus + FiftyOne.

FiftyOne provides an API to create Milvus collection, upload vectors, and run
similarity queries, both :ref:`programmatically <milvus-query>` in Python and
via point-and-click in the App.

.. note::

    Did you know? You can
    :ref:`search by natural language <brain-similarity-text>` using Milvus
    similarity indexes!

.. image:: /images/brain/brain-object-similarity.gif
   :alt: object-similarity
   :align: center

.. _milvus-basic-recipe:

Basic recipe
____________

The basic workflow to use Milvus to create a similarity index on your
FiftyOne datasets and use this to query your data is as follows:

1)  Load a :ref:`dataset <loading-datasets>` into FiftyOne

2)  Compute embedding vectors for samples or patches in your dataset, or select
    a model to use to generate embeddings

3)  Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
    methodto generate a Milvus similarity index for the samples or object
    patches in a dataset by setting the parameter `backend="milvus"` and
    specifying a `brain_key` of your choice

4)  Use this Milvus similarity index to query your data with
    :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

5)  If desired, delete the index

|br|
The example below demonstrates this workflow.

.. note::

    You must `connect to a Milvus server <https://milvus.io/docs/install_standalone-docker.md>`_ 
    and install the
    `Milvus Python client <https://github.com/milvus-io/pymilvus>`_
    to run this example:

    .. code-block:: shell

        pip install pymilvus

    Note that you can store your Milvus credentials as described in
    :ref:`this section <milvus-setup>` to avoid entering them manually each
    time you interact with your Milvus index.

First let's load a dataset into FiftyOne and compute embeddings for the
samples:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Steps 2 and 3: Compute embeddings and create a similarity index
    milvus_index = fob.compute_similarity(
        dataset, 
        brain_key="milvus_index",
        backend="milvus",
        collection_name = "first_collection",
    )

Once the similarity index has been generated, we can query our data in FiftyOne
by specifying the `brain_key`:

.. code-block:: python
    :linenos:

    # Step 4: Query your data
    query = dataset.first().id  # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key=brain_key,
        k=10,  # limit to 10 most similar samples
    )

    # Step 5 (optional): Cleanup

    # Delete the Milvus index
    milvus_index = dataset.load_brain_results(brain_key)
    milvus_index.cleanup()

    # Delete run record from FiftyOne
    dataset.delete_brain_run("milvus_index")

.. note::

    Skip to :ref:`this section <milvus-examples>` to see a variety of common
    Milvus query patterns.

.. _milvus-setup:

Setup
_____

The easiest way to get started with Milvus is to 
`install Milvus standalone using Docker Compose <https://milvus.io/docs/install_standalone-docker.md>`_.

Download the YAML file by running the following command:

.. code-block:: shell

    wget wget https://github.com/milvus-io/milvus/releases/download/v2.2.10/milvus-standalone-docker-compose.yml -O docker-compose.yml

In the same directory as the docker-compose.yml file, start up Milvus by running:

.. code-block:: shell

    sudo docker-compose up -d

.. note::

    If your system has Docker Compose V2 installed instead of V1, use 
    `docker compose` instead of `docker-compose`. Check if this is the case with 
    `$ docker compose version`.

Installing the Milvus client
------------------------------

In order to use the Milvus backend, you must install the
`Milvus Python client <https://github.com/milvus-io/pymilvus>`_:

.. code-block:: shell

    pip install pymilvus


Connecting to the Milvus server
-------------------------------

Verify which local port the Milvus server is listening on by running:

.. code-block:: shell

    sudo docker-compose ps

To connect to the Milvus server in Python, you must specify the `host` and `port`:

.. code-block:: python
    :linenos:

    from pymilvus import (
        connections,
    )
    connections.connect("default", host="localhost", port="19530")

Using the Milvus backend
--------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
will use an sklearn backend.

To use the Milvus backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"milvus"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(..., backend="milvus", ...)

Alternatively, you can permanently configure FiftyOne to use the Milvus
backend by setting the `FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND` environment
variable:

.. code-block:: shell

    export FIFTYONE_BRAIN_DEFAULT_SIMILARITY_BACKEND=milvus

or by setting the `default_similarity_backend` parameter of your
:ref:`brain config <brain-config>` located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "default_similarity_backend": "milvus"
    }

Authentication
--------------

If you'd like, you can specify the user and password for connecting to a Milvus 
server. This can be done in a variety of ways, as well as the `uri`.

**Environment variables (recommended)**

The recommended way to configure your Milvus credentials is to store them
in the
`FIFTYONE_BRAIN_SIMILARITY_MILVUS_USER`,
`FIFTYONE_BRAIN_SIMILARITY_MILVUS_PASSWORD`, and
`FIFTYONE_BRAIN_SIMILARITY_MILVUS_URI` environment variables. These are 
automatically accessed by FiftyOne whenever a connection to Milvus is
made.

.. code-block:: shell

    export FIFTYONE_BRAIN_SIMILARITY_MILVUS_USER=XXXXXX
    export FIFTYONE_BRAIN_SIMILARITY_MILVUS_PASSWORD=XXXXXX
    export FIFTYONE_BRAIN_SIMILARITY_MILVUS_URI=XXXXXX

**FiftyOne Brain config**

You can also store your credentials in your :ref:`brain config <brain-config>`
located at `~/.fiftyone/brain_config.json`:

.. code-block:: json

    {
        "similarity_backends": {
            "milvus": {
                "user": "XXXXXXXXXXXX",
                "password": "XXXXXXXXXXXX",
                "uri": "XXXXXXXXXXXX"
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide your Milvus credentials as keyword arguments each
time you call methods like
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` that require
connections to Milvus:

.. code:: python
    :linenos:

    import fiftyone.brain as fob 
    
    milvus_index = fob.compute_similarity(
        ...
        backend="milvus",
        brain_key="milvus_index",
        user="XXXXXX",
        password="XXXXXX",
        uri="XXXXXX",
    )

Note that, when using this strategy, you must manually provide the credentials
when loading an index later via
:meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`:

.. code:: python
    :linenos:

    milvus_index = dataset.load_brain_results(
        "milvus_index",
        user="XXXXXX",
        password="XXXXXX",
        uri="XXXXXX",
    )

.. _milvus-config-parameters:

Milvus config parameters
--------------------------

The Milvus backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters include:

*   **metric**: the distance/similarity metric to use for the index. If not
    specified, the default value is `"dotproduct"`. Supported values are
    `("dotproduct", "euclidean")`. These are referred to via `"IP"` and `"L2"`
    in the Milvus documentation, respectively.
*   **collection_name**: the name of the Milvus collection to use or create. If not
    specified, a new unique name is generated automatically
*   **uri**: the full address of the Milvus server to connect to. If not
    specified, the default value is `"http://localhost:19530"`
*   **user**: username if using `RBAC <https://milvus.io/docs/rbac.md>`_
*   **password**: password for supplied username
*   **consistency_level**:  which consistency level to use. Possible values are `("Strong", "Session", "Bounded", "Eventually")`. The default value is `"Session"`.

For detailed information on these parameters, see the 
`Milvus authentication documentation <https://milvus.io/docs/authenticate.md>`_ 
and `Milvus consistency levels documentation <https://milvus.io/docs/consistency.md#Consistency-levels>`_.

You can specify these parameters via any of the strategies described in the
previous section. Here's an example of a :ref:`brain config <brain-config>`
that includes all of the available parameters:

.. code-block:: json

    {
        "similarity_backends": {
            "milvus": {
                "uri": "XXXXXXXXXXXX",
                "user": "XXXXXXXXXXXX",
                "password": "XXXXXXXXXXXX",
                "collection_name": null,
                "metric": "dotproduct",
                "consistency_level": "Strong",
            }
        }
    }

However, typically these parameters are directly passed to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to configure
a specific new index:

.. code:: python
    :linenos:

    milvus_index = fob.compute_similarity(
        ...
        backend="milvus",
        brain_key="milvus_index",
        index_name="your-index-name",
        metric="dotproduct",
    )

.. _milvus-managing-brain-runs:

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
    will not delete any associated Milvus collection, which you can do as follows:

    .. code:: python

        # Delete the Milvus index
        milvus_collection = dataset.load_brain_results(brain_key)
        milvus_collection.cleanup()

.. _milvus-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the Milvus backend.

.. note::

    All of the examples below assume you have configured your Milvus server
    and connection as described in :ref:`this section <milvus-setup>`.

.. _milvus-new-similarity-index:

Create a similarity index
-------------------------

In order to create a new Milvus similarity index, you need to specify either
the `embeddings` or `model` argument to
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
    brain_key = "milvus_index"

    # Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        model=model_name,
        backend="milvus",
        brain_key=brain_key,
    )

    # Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        model=model
        backend="milvus",
        brain_key=brain_key,
    )

    # Option 3: Pass precomputed embeddings as a numpy array
    embeddings = dataset.compute_embeddings(model)
    fob.compute_similarity(
        dataset,
        embeddings=embeddings,
        backend="milvus",
        brain_key=brain_key,
    )

    # Option 4: Pass precomputed embeddings by field name
    dataset.compute_embeddings(model, embeddings_field="embeddings")
    fob.compute_similarity(
        dataset,
        embeddings="embeddings",
        backend="milvus",
        brain_key=brain_key,
    )

.. note::

    You can customize the Milvus similarity index by passing any
    :ref:`supported parameters <milvus-config-parameters>` as extra kwargs.

.. _milvus-patch-similarity-index:

Create a patch similarity index
-------------------------------

You can also create a similarity index for
:ref:`object patches <brain-object-similarity>` within your dataset by
specifying a `patches_field` argument to
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
        backend="milvus",
        brain_key="milvus_patches",
    )

.. note::

    You can customize the Milvus index by passing any
    :ref:`supported parameters <milvus-config-parameters>` as extra kwargs.

.. _milvus-connect-to-existing-collection:

Connect to an existing collection
---------------------------------

If you have already created a Milvus collection storing the embedding vectors for
the samples or patches in your dataset, you can connect to it by passing the
`collection_name` to
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
        collection_name="your-index",            # the existing Milvus index
        brain_key="milvus_index",
        backend="milvus",
    )

.. _milvus-add-remove-embeddings:

Add/remove embeddings from an index
-----------------------------------

You can use
:meth:`add_to_index() <fiftyone.brain.similarity.SimilarityIndex.add_to_index>`
and
:meth:`remove_from_index() <fiftyone.brain.similarity.SimilarityIndex.remove_from_index>`
to add and remove embeddings from an existing Milvus similarity index.

These methods can come in handy if you modify your FiftyOne dataset and need
to update the Milvus similarity index to reflect these changes:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    milvus_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        brain_key="milvus_index",
        backend="milvus",
    )
    print(milvus_index.total_index_size)  # 200

    view = dataset.take(10)
    ids = view.values("id")

    # Delete 10 samples from a dataset
    dataset.delete_samples(view)

    # Delete the corresponding vectors from the index
    milvus_index.remove_from_index(sample_ids=ids)

    # Add 20 samples to a dataset
    samples = [fo.Sample(filepath="tmp%d.jpg" % i) for i in range(20)]
    sample_ids = dataset.add_samples(samples)

    # Add corresponding embeddings to the index
    embeddings = np.random.rand(20, 512)
    milvus_index.add_to_index(embeddings, sample_ids)

    print(milvus_index.total_index_size)  # 210

.. _milvus-get-embeddings:

Retrieve embeddings from an index
---------------------------------

You can use
:meth:`get_embeddings() <fiftyone.brain.similarity.SimilarityIndex.get_embeddings>`
to retrieve embeddings from a Milvus index by ID:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    milvus_index = fob.compute_similarity(
        dataset, 
        model="clip-vit-base32-torch"
        brain_key="milvus_index",
        backend="milvus",
    )

    # Retrieve embeddings for the entire dataset
    ids = dataset.values("id")
    embeddings, sample_ids, _ = milvus_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (200, 512)
    print(sample_ids.shape)  # (200,)

    # Retrieve embeddings for a view
    ids = dataset.take(10).values("id")
    embeddings, sample_ids, _ = milvus_index.get_embeddings(sample_ids=ids)
    print(embeddings.shape)  # (10, 512)
    print(sample_ids.shape)  # (10,)

.. _milvus-query:

Querying a Milvus index
-------------------------

You can query a Milvus index by appending a
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
        model="clip-vit-base32-torch"
        brain_key="milvus_index",
        backend="milvus",
    )

    # Query by vector
    query = np.random.rand(512)  # matches the dimension of CLIP embeddings
    view = dataset.sort_by_similarity(query, k=10, brain_key="milvus_index")

    # Query by sample ID
    query = dataset.first().id
    view = dataset.sort_by_similarity(query, k=10, brain_key="milvus_index")

    # Query by a list of IDs
    query = [dataset.first().id, dataset.last().id]
    view = dataset.sort_by_similarity(query, k=10, brain_key="milvus_index")

    # Query by text prompt
    query = "a photo of a dog"
    view = dataset.sort_by_similarity(query, k=10, brain_key="milvus_index")

.. note::

    Performing a similarity search on a |DatasetView| will **only** return
    results from the view; if the view contains samples that were not included
    in the index, they will never be included in the result.

    This means that you can index an entire |Dataset| once and then perform
    searches on subsets of the dataset by
    :ref:`constructing views <using-views>` that contain the images of
    interest.

.. _milvus-access-client:

Accessing the Milvus client
-----------------------------

You can use the `get_collection()` method of a Milvus index to directly access the
underlying Milvus client instance and use its methods as desired:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    milvus_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch"
        brain_key="milvus_index",
        backend="milvus",
    )

    print(milvus_index.get_collection())

    # The Milvus SDK is already initialized for you as well
    from pymilvus import utility
    print(utility.list_collections())

.. _milvus-advanced-usage:

Advanced usage
--------------

As :ref:`previously mentioned <milvus-config-parameters>`, you can customize
your Milvus indexes by providing optional parameters to
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`.

Here's an example of creating a similarity index backed by a customized
Milvus similarity index. Just for fun, we'll specify a custom collection name, use
euclidean distance, and populate the index for only a subset of our dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom Milvus index
    milvus_index = fob.compute_similarity(
        dataset,
        model="clip-vit-base32-torch",
        embeddings=False,  # we'll add embeddings below
        metric="euclidean",
        brain_key="milvus_index",
        backend="milvus",
        collection_name="custom-milvus-collection",
    )

    # Add embeddings for a subset of the dataset
    view = dataset.take(10)
    embeddings, sample_ids, _ = milvus_index.compute_embeddings(view)
    milvus_index.add_to_index(embeddings, sample_ids)

    print(milvus_index.index)

    # The Milvus SDK is already initialized for you as well
    from pymilvus import utility
    print(utility.list_collections())
