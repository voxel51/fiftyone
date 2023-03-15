.. _pinecone-integration:

Pinecone Integration
====================

.. default-role:: code

`Pinecone <https://www.pinecone.io/>`_ is one of the most popular vector search 
engine tools available, and we've made it easy to use Pinecone's vector search 
capabilities on your computer vision data directly from FiftyOne!

FiftyOne provides :ref:`simple setup instructions <pinecone-setup>` that you can
use to specify your Pinecone API key and environment.

FiftyOne provides an API to create collections, upload data, and run search 
queries using Pinecone, all programmatically in Python. Currently, these methods
are explicitly supported for sample-level and patch-level embeddings for image
datasets. 

.. note::

    If you have a video dataset, you can convert videos to frames and then use
    the FiftyOne Pinecone integration to perform search on the frames.

.. _pinecone-basic-recipe:

Basic recipe
____________

The basic workflow to use Pinecone to create a similarity index on your FiftyOne
datasets and use this to query your data is as follows:

1) Load a :ref:`dataset <loading-datasets>` into FiftyOne

2) Compute embedding vectors for samples or patches in your dataset, or select a
    model to use to generate embeddings

3) Use the :meth:`compute_similarity() <fiftyone.brain.compute_similarity>`
   method on your dataset or view to generate a similarity index for the samples
   or object patches using Pinecone by setting the parameter 
   `backend="pinecone"`, and setting a Brain key if desired

4) Use this Pinecone similarity index to query your data with the 
   :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`
   , specifying the corresponding Brain key if there are multiple similarity
   indexes on your dataset

5) If desired, delete the Pinecone collection

|br|
The example below demonstrates this workflow.

.. note::

    You must create a `Pinecone account <https://www.pinecone.io/>`_ in order to
    run this example.

    Note that you can store your Pinecone API key, environment, and vector 
    search configs as described in :ref:`this section <pinecone-setup>` to avoid 
    entering them manually each time you interact with Pinecone. Copy your 
    `Pinecone API key <https://app.pinecone.io/organizations>`_. 

    You'll also need to install the
    `Pinecone Python client <hhttps://github.com/pinecone-io/pinecone-python-client>`_:

    .. code-block:: shell

        pip install -U pinecone-client

First we load a dataset into FiftyOne and compute embeddings for the samples:

.. code-block:: python
    :linenos:

    # Step 2: Load your data into FiftyOne
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "quickstart", dataset_name="pinecone-vector-search-example"
    )
    dataset.persistent = True

    # Steps 3 and 4: Compute embeddings and similarity index for your data
    pinecone_index = fob.compute_similarity(
        dataset, 
        brain_key = "pinecone",
        backend="pinecone",
        api_key=...,
        environment=...,
    )

Once the similarity index has been generated, we can query our data in
FiftyOne by specifying the Brain key:

.. code-block:: python
    :linenos:

    dataset = fo.load_dataset("pinecone-vector-search-example")
    brain_key = "pinecone"

   # Step 5: Query your data
    query = dataset.first().id # query by sample ID
    view = dataset.sort_by_similarity(
        query, 
        brain_key = brain_key
        k = 10 # limit to 10 most similar samples
    )

    # Step 6: Cleanup

    # Delete collection from Pinecone
    pinecone_index = dataset.load_brain_results(brain_key)
    pinecone_client = pinecone_index.connect_to_api()
    results.cleanup() 

    # Delete run record from FiftyOne
    dataset.delete_brain_run(brain_key)

.. note::

    See :ref:`this section <pinecone-examples>` to see a variety of common
    Pinecone query patterns.

.. _pinecone-setup:

Setup
_____

The easiest way to `create a free Pinecone account <https://www.pinecone.io/>`_, 
and copy your Pinecone API key.  

Installing the Pinecone client
------------------------------

In order to use the Pinecone backend, you must install the
`Pinecone Python client 
<https://github.com/pinecone-io/pinecone-python-client>`_:

.. code-block:: shell

    pip install -U pinecone-client

Using the Pinecone backend
--------------------------

By default, calling
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` or 
:meth:`sort_by_similarity() <fiftyone.core.collection.sort_by_similarity>` will
use an Sklearn backend.

To use the Pinecone backend, simply set the optional `backend` parameter of
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>` to
`"pinecone"`:

.. code:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_similarity(
        view,
        backend="pinecone",
        ...
    )

Alternatively, you can permanently configure FiftyOne to use the Pinecone
backend by setting the `FIFTYONE_DEFAULT_SIMILARITY_BACKEND` environment
variable:

.. code-block:: shell

    export FIFTYONE_DEFAULT_SIMILARITY_BACKEND=pinecone

or by setting the `default_similarity_backend` parameter of your
:ref:`Fiftyone Brain config <fiftyone-brain-config>` located at
`~/.fiftyone/brain_config.json`:

.. code-block:: text

    {
        "default_similarity_backend": "pinecone"
    }

Authentication
--------------

In order to connect to a Pinecone server, you must provide your server url, 
which  can be done in a variety of ways.

**Environment variables (recommended)**

The recommended way to configure your Pinecone connection is to store your 
Pinecone API key and environment as environment variables in the
`FIFTYONE_PINECONE_API_KEY` and `FIFTYONE_PINECONE_ENVIRONMENT` environment 
variable. These are automatically accessed by FiftyOne whenever a connection to 
Pinecone is made.

.. code-block:: shell

    export FIFTYONE_PINECONE_API_KEY=XXXXXX
    export FIFTYONE_PINECONE_ENVIRONMENT="us-west1-gcp"


**FiftyOne Brain config**

You can also store your credentials in your
:ref:`Brain config <brain-config>` located at
`~/.fiftyone/brain_config.json`:

.. code-block:: text

    {
        "similarity_backends": {
            "pinecone": {
                "api_key": "XXXXXXXXXXXX",
                "environment": "us-west1-gcp"
            }
        }
    }

Note that this file will not exist until you create it.

**Keyword arguments**

You can manually provide these as keyword arguments each time you call methods 
like :meth:`compute_similarity() <fiftyone.brain.compute_similarity>` that 
require connections to Pinecone:

.. code:: python
    :linenos:

    import fiftyone.brain as fob 
    
    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset,
        backend="pinecone",
        brain_key="pinecone",
        model="resnet-50-imagenet-torch"
        api_key="XXXXXX",
        environment="us-west1-gcp",
        ...
    )


.. _pinecone-query-parameters:

Pinecone query parameters
--------------------------

The Pinecone backend supports a variety of query parameters that can be used to
customize your similarity queries. These parameters include:

* `index_name`: the name of the Pinecone index to use. If not specified, one is
  generated for the index by FiftyOne.
* `pods`: the number of pods to use for the index. If not specified, the
  default value is 1.
* `pod_type`: the type of pod to use for the index. If not specified, the
  default value is "p1".
* `replicas`: the number of replicas to use for the index. If not specified, 
  the default value is 1.
* `shards`: the number of shards to use for the index. If not specified, the 
  default value is 1.
* `metric`: the distance/similarity metric to use for the index. If not 
  specified, the default value is "cosine". Allowed values are 
  `("cosine", "dotproduct", "euclidean")`.

For detailed information on these parameters, see the 
`Pinecone index documentation <https://docs.pinecone.io/docs/indexes>`_.

You can specify these parameters in a variety of ways:

In your FiftyOne Brain config located at `~/.fiftyone/brain_config.json`. Here
is an example of a config that specifies all of the available parameters:

.. code-block:: text

    {
        "similarity_backends": {
            "pinecone": {
            "config_cls": "fiftyone.brain.internal.core.pinecone.PineconeSimilarityConfig",
            "api_key": "XXXXXXXXXXXX",
            "environment": "us-west1-gcp",
            "pods": 1,
            "pod_type": "p1",
            "replicas": 1,
            "shards": 1,
            "metric": "cosine"
            },
        }
    }

.. _pinecone-managing-brain-runs:

Managing brain runs
________________________

FiftyOne provides a variety of methods that you can use to manage brain runs.

For example, you can call
:meth:`list_brain_runs() <fiftyone.core.collections.SampleCollection.list_brain_runs>`
to see the available brain keys on a dataset:

.. code:: python
    :linenos:

    dataset.list_brain_runs()

Or, you can use
:meth:`get_brain_info() <fiftyone.core.collections.SampleCollection.get_brain_info>`
to retrieve information about the configuration of a brain run:

.. code:: python
    :linenos:

    info = dataset.get_brain_info(brain_key)
    print(info)

Use :meth:`load_brain_results() <fiftyone.core.collections.SampleCollection.load_brain_results>`
to load the :class:`SimilarityResults <fiftyone.brain.similarity.SimilarityResults>`
instance for a brain run.



You can use
:meth:`rename_brain_run() <fiftyone.core.collections.SampleCollection.rename_brain_run>`
to rename the brain key associated with an existing similarity results run:

.. code:: python
    :linenos:

    dataset.rename_brain_run(sim_key, new_sim_key)

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
    only deletes the **record** of the brain run from your FiftyOne
    dataset; it will not delete any Pinecone collection associated with your 
    dataset.

.. _pinecone-examples:

Examples
________

This section demonstrates how to perform some common vector search workflows on 
a FiftyOne dataset using the Pinecone backend.

.. note::

    All of the examples below assume you have configured your Pinecone API key
    and environment as described in :ref:`this section <pinecone-setup>`.

.. _pinecone-new-similarity-index:

Create new similarity index
-----------------------------

In order to create a new 
:ref:`PineconeSimilarityIndex <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex>`
, you need to specify either the `embeddings` or `model` argument to 
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    model_name = "resnet-50-imagenet-torch"
    model = foz.load_zoo_model(model_name)

    brain_key = "pinecone"

    ## Option 1: Compute embeddings on the fly from model name
    fob.compute_similarity(
        dataset,
        brain_key,
        model = model_name,
        backend="pinecone",
        api_key="XXXXXXXXX",
        environment="us-west1-gcp",
    )

    ## Option 2: Compute embeddings on the fly from model instance
    fob.compute_similarity(
        dataset,
        brain_key,
        model=model
        backend="pinecone",
        api_key="XXXXXXXXX",
        environment="us-west1-gcp",
    )

    ## Option 3: Pass in pre-computed embeddings as a NumPy array
    embeddings = fob.compute_embeddings(
        dataset,
        model = model,
    )

    fob.compute_similarity(
        dataset,
        brain_key,
        embeddings=embeddings,
        backend="pinecone",
        api_key="XXXXXXXXX",
        environment="us-west1-gcp",
    )

    ## Option 4: Pass in pre-computed embeddings by field name
    fob.compute_embeddings(
        dataset,
        model = model,
        embeddings_field="embeddings",
    )

    fob.compute_similarity(
        dataset,
        brain_key,
        embeddings_field="embeddings",
        backend="pinecone",
        api_key="XXXXXXXXX",
        environment="us-west1-gcp",
    )

    print(dataset.get_brain_info(brain_key))

.. _pinecone-connect-to-existing-index:

Connect to existing Pinecone index
-----------------------------------

If you have already created a Pinecone index storing the embedding vectors for
the samples or patches in your dataset, you can connect to it to your dataset
by passing in `embeddings=False` to 
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset,
        brain_key,
        model = "clip-vit-base32-torch",
        embeddings=False,
        backend="pinecone",
        api_key="XXXXXXXXX",
        environment="us-west1-gcp",
    )

This creates a 
:ref:`PineconeSimilarityIndex <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex>`
with the relevant data, without requiring that you recompute the embeddings.
This approach can be useful if you are computing your embeddings in a separate
process or on a different machine.

.. _pinecone-patch-similarity-index:

Create a patch embeddings similarity index
-------------------------------------------

You can also create a similarity index for object patches within your dataset 
by specifying a `patches_field` argument to 
:meth:`compute_similarity() <fiftyone.brain.compute_similarity>`:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset, 
        patches_field="detections",
        model = "resnet-50-imagenet-torch"
        brain_key = "pinecone_patches", 
        backend="pinecone",
        api_key="XXXXXXXXX",
        environment="us-west1-gcp",
    )

    print(dataset.get_brain_info(brain_key))

.. _pinecone-connect-to-client:

Connect to Pinecone client
---------------------------

You can connect to an instance of the Pinecone index storing your FiftyOne 
dataset's embeddings using the
:ref:`index <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex.index>`
attribute. You can then access all of the Pinecone index's methods:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    api_key = "XXXXXXXXX"
    environment = "us-west1-gcp"
    index_name = "fiftyone-quickstart"

    dataset = foz.load_zoo_dataset("quickstart")

    res = fob.compute_similarity(
        dataset, 
        model = "resnet-50-imagenet-torch"
        brain_key = "pinecone", 
        backend="pinecone",
        index_name=index_name,
        api_key=api_key,
        environment=environment,
    )

    pinecone_index = res.index
    print(pinecone_index)

    ### or connect directly to Pinecone client:
    import pinecone
    pinecone.init(api_key=api_key, environment=environment)
    print(pinecone.list_indexes())
    print(pinecone.describe_index(index_name))

.. _pinecone-get-embeddings:

Retrieve embeddings from Pinecone index
----------------------------------------

You can retrieve the embeddings from a Pinecone index using the 
:method:`get_embeddings() <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex.get_embeddings>`
method. This can be applied to an entire dataset, or a view into a dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pinecone_index = fob.compute_similarity(
        dataset, 
        model = "resnet-50-imagenet-torch"
        brain_key = "pinecone", 
        backend="pinecone",
        index_name="fiftyone-quickstart",
        api_key=api_key,
        environment=environment,
    )

    dataset_embeddings = pinecone_index.get_embeddings(dataset)

    ## create a view into the dataset
    view = dataset.take(10)
    ## get embeddings for the view
    view_embeddings, sample_ids, _ = pinecone_index.compute_embeddings(view)

.. _pinecone-query-embeddings:

Query embeddings with Pinecone index
-------------------------------------------

You can query a 
:ref:`PineconeSimilarityIndex <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex>`
instance using the 
:meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>` 
method. This can be applied to an entire dataset, or a view into a dataset. The 
query can be any of the following:

1. A single numerical vector of the same length as the embeddings
2. An ID (sample or patch)
3. A list of IDs (sample or patches)
4. A text prompt

A query can only be a text prompt if the model used to compute the embeddings 
supports text prompts. Here are examples of all of these, using the CLIP model, 
which supports text prompts:

.. code:: python
    :linenos:

    import numpy as np

    import fiftyone as fo
    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    fob.compute_similarity(
        dataset, 
        model = "clip-vit-base32-torch"
        brain_key = "pinecone", 
        backend="pinecone",
        index_name="fiftyone-quickstart",
        api_key=api_key,
        environment=environment,
    )

    ## query by numerical vector
    query = np.random.rand(512) ## 512 is the length of the CLIP embeddings

    ## query by single ID
    query = dataset.first().id

    ## query by list of IDs
    query = [dataset.first().id, dataset.last().id]

    ## query by text prompt
    query = "a photo of a dog"

    view = dataset.sort_by_similarity(query, brain_key="pinecone", k = 10)
    print(view)

.. _pinecone-edit-collection:

Editing a Pinecone collection
------------------------------

You can edit a Pinecone index by adding or removing samples and patches from
the index. This can be done using the 
:method:`add_to_index() <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex.add_to_index>` 
and 
:method:`remove_from_index() <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex.remove_from_index>`
methods. These methods can come in handy if you want to add or remove samples 
or object patches from your dataset, and then update the Pinecone index to 
reflect these changes.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    pinecone_index = fob.compute_similarity(
        dataset, 
        model = "clip-vit-base32-torch"
        brain_key = "pinecone", 
        backend="pinecone",
        index_name="fiftyone-quickstart",
        api_key=api_key,
        environment=environment,
    )

    samples_to_delete = dataset.take(10)
    dataset.delete_samples(samples_to_delete)
    pinecone_index.remove_from_index(samples_to_delete)
    
    samples_to_add = dataset.take(20)
    dataset.add_samples(samples_to_add)
    pinecone_index.add_to_index(samples_to_add)
    

You can also get the total number of vectors in the index using the 
:ref:`total_index_size <fiftyone.brain.internal.core.pinecone.PineconeSimilarityIndex.total_index_size>`
attribute. Continuing the above code:

.. code:: python
    :linenos:

    print(pinecone_index.total_index_size)
    ## will return 210, since we removed 10 samples and then added 20 samples 