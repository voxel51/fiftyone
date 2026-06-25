.. _twelvelabs-integration:

TwelveLabs Integration
======================

.. default-role:: code

FiftyOne integrates with `TwelveLabs <https://twelvelabs.io>`_, whose video
foundation models let you embed and caption videos for dataset curation with a
few lines of code:

-   **Marengo** generates 512-dimensional video embeddings (and matching text
    embeddings), so you can compute visualizations, build similarity indexes,
    and run text-to-video searches over your video datasets.
-   **Pegasus** generates natural-language captions/answers about a video,
    which you can store as
    :class:`Classification <fiftyone.core.labels.Classification>` labels.

The models run server-side via the TwelveLabs API, so no local GPU is required.

.. _twelvelabs-setup:

Setup
_____

Install the `twelvelabs` package:

.. code-block:: shell
    :linenos:

    pip install twelvelabs

You can grab a free API key at `twelvelabs.io <https://twelvelabs.io>`_ — there
is a generous free tier. Provide it via the ``TWELVELABS_API_KEY`` environment
variable:

.. code-block:: shell
    :linenos:

    export TWELVELABS_API_KEY=...

or pass it directly via the ``api_key`` config parameter when loading the
model.

.. _twelvelabs-embeddings:

Video embeddings
________________

Apply the Marengo embedding model to your video dataset to power
visualizations and similarity searches:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.brain as fob
    from fiftyone.utils.twelvelabs import (
        TwelveLabsModel,
        TwelveLabsModelConfig,
    )

    dataset = foz.load_zoo_dataset("quickstart-video")

    model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "embed"}))

    dataset.compute_embeddings(model, embeddings_field="twelvelabs")

Because Marengo aligns text and video in a shared embedding space, you can
build a similarity index and run text-to-video searches:

.. code-block:: python
    :linenos:

    index = fob.compute_similarity(
        dataset,
        model=model,
        embeddings="twelvelabs",
        brain_key="tl_sim",
    )

    view = dataset.sort_by_similarity("a person riding a bike", k=10)

    session = fo.launch_app(view)

.. _twelvelabs-captions:

Video captions
______________

Apply the Pegasus model to caption your videos for curation. Captions are
stored as :class:`Classification <fiftyone.core.labels.Classification>`
labels:

.. code-block:: python
    :linenos:

    model = TwelveLabsModel(
        TwelveLabsModelConfig({"operation": "caption"})
    )

    dataset.apply_model(model, label_field="caption")

You can customize the prompt and generation length:

.. code-block:: python
    :linenos:

    model = TwelveLabsModel(
        TwelveLabsModelConfig(
            {
                "operation": "caption",
                "prompt": "List the main objects that appear in this video.",
                "max_tokens": 1024,
            }
        )
    )
