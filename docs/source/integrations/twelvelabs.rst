.. _twelvelabs-integration:

TwelveLabs Integration
======================

.. default-role:: code

FiftyOne integrates with `TwelveLabs <https://twelvelabs.io>`_, whose video
foundation models let you embed, caption, and segment videos for dataset
curation with a few lines of code:

-   **Marengo** generates 512-dimensional video embeddings (and matching text
    embeddings), so you can compute visualizations, build similarity indexes,
    and run text-to-video searches over your video datasets
-   **Pegasus** generates natural-language captions/answers about a video, and
    segments videos into timestamped segments with custom metadata

The models run server-side via the TwelveLabs API, so no local GPU is required.

.. _twelvelabs-setup:

Setup
_____

Install the `twelvelabs` package:

.. code-block:: shell
    :linenos:

    pip install "twelvelabs>=1.3.5"

You can grab a free API key at `twelvelabs.io <https://twelvelabs.io>`_ — there
is a generous free tier. Provide it via the ``TWELVELABS_API_KEY`` environment
variable:

.. code-block:: shell
    :linenos:

    export TWELVELABS_API_KEY=...

or pass it directly via the ``api_key`` config parameter when loading the
model.

.. _twelvelabs-modes:

On-the-fly vs index mode
________________________

The integration can process your videos in two ways, selected via the ``mode``
parameter:

-   ``"on_the_fly"`` (default): videos are processed directly, without
    indexing. Embeddings use **Marengo 3.5** and analysis uses
    **Pegasus 1.6**. Local videos are uploaded once and reused across
    operations, and video URLs are passed through as-is
-   ``"index"``: videos are first indexed into a TwelveLabs index, so they are
    also searchable in the TwelveLabs platform. Embeddings are retrieved from
    the index (**Marengo 3.0**), and **Pegasus 1.6** analyzes the indexed
    videos

.. code-block:: python
    :linenos:

    from fiftyone.utils.twelvelabs import TwelveLabsModel, TwelveLabsModelConfig

    # Marengo 3.5, no indexing
    model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "embed"}))

    # Marengo 3.0, via a TwelveLabs index
    model = TwelveLabsModel(
        TwelveLabsModelConfig({"operation": "embed", "mode": "index"})
    )

In index mode, a new index is created the first time one is needed, and its ID
is available via ``model.index_id``. Pass ``index_id=...`` to reuse an existing
index, and call ``model.delete_index()`` when you no longer need it.

.. note::

    Marengo 3.5 and Marengo 3.0 embeddings are not compatible with each
    other, so use the same model to embed both your videos and your text
    queries.

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
    from fiftyone.utils.twelvelabs import TwelveLabsModel, TwelveLabsModelConfig

    dataset = foz.load_zoo_dataset("quickstart-video")

    # Load directly
    model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "embed"}))

    # Load via zoo
    # model = foz.load_zoo_model("twelvelabs-marengo3.5")

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

    view = dataset.sort_by_similarity(
        "a person riding a bike",
        brain_key="tl_sim",
        k=10,
    )

    session = fo.launch_app(view)

By default, Marengo 3.5 fuses the visual and audio content of each video into a
single embedding. You can choose the modalities to embed and request shorter
embeddings for smaller, faster similarity indexes:

.. code-block:: python
    :linenos:

    model = foz.load_zoo_model(
        "twelvelabs-marengo3.5",
        embedding_options=["visual"],
        embedding_dimension=256,  # 128, 256, or 512
    )

.. _twelvelabs-captions:

Video captions
______________

Apply the Pegasus model to caption your videos for curation:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone.utils.twelvelabs import TwelveLabsModel, TwelveLabsModelConfig

    dataset = foz.load_zoo_dataset("quickstart-video")

    # Load directly
    model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "caption"}))

    # Load via zoo
    # model = foz.load_zoo_model("twelvelabs-pegasus1.6")

    dataset.apply_model(model, label_field="caption")

You can customize the prompt and generation length:

.. code-block:: python
    :linenos:

    # Load directly
    model = TwelveLabsModel(
        TwelveLabsModelConfig(
            {
                "operation": "caption",
                "prompt": "List the main objects that appear in this video.",
                "max_tokens": 1024,
            }
        )
    )

    # Load via zoo
    model = foz.load_zoo_model(
        "twelvelabs-pegasus1.6",
        prompt="List the main objects that appear in this video.",
        max_tokens=1024,
    )

.. _twelvelabs-segments:

Video segments
______________

Pegasus 1.6 can segment your videos into timestamped segments and extract
custom metadata for each segment. The segments are stored as
:class:`TemporalDetections <fiftyone.core.labels.TemporalDetections>`, with
one :class:`TemporalDetection <fiftyone.core.labels.TemporalDetection>` per
segment whose label is the segment definition's ``id`` and whose extracted
metadata fields are stored as attributes:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone.utils.twelvelabs import TwelveLabsModel, TwelveLabsModelConfig

    dataset = foz.load_zoo_dataset("quickstart-video")

    # Load directly
    model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "segment"}))

    # Load via zoo
    # model = foz.load_zoo_model("twelvelabs-pegasus1.6-segment")

    dataset.apply_model(model, label_field="segments")

    session = fo.launch_app(dataset)

By default, videos are segmented into scenes with a ``description`` of each
scene. You can provide up to 10 of your own
`segment definitions <https://docs.twelvelabs.io/docs/guides/segment-videos>`_,
each with up to 20 typed fields. Use the ``time_array`` field type to extract
timestamped events inside each segment:

.. code-block:: python
    :linenos:

    model = foz.load_zoo_model(
        "twelvelabs-pegasus1.6-segment",
        segment_definitions=[
            {
                "id": "play",
                "description": "Each distinct play in the game",
                "fields": [
                    {
                        "name": "summary",
                        "type": "string",
                        "description": "A one-sentence summary of the play",
                    },
                    {
                        "name": "scored",
                        "type": "boolean",
                        "description": "Whether the play resulted in a score",
                    },
                    {
                        "name": "key_moments",
                        "type": "time_array",
                        "description": "The key moments of the play",
                        "items": {
                            "type": "object",
                            "fields": [
                                {
                                    "name": "event",
                                    "type": "string",
                                    "description": "What happens",
                                }
                            ],
                        },
                    },
                ],
            }
        ],
        min_segment_duration=4,
        max_segment_duration=60,
        max_tokens="unlimited",  # segment long videos without a token limit
    )

    dataset.apply_model(model, label_field="plays")

    # Find all scoring plays
    from fiftyone import ViewField as F

    view = dataset.filter_labels("plays", F("scored") == True)
