.. _model-zoo-remote:

Remotely-Sourced Zoo Models
===========================

.. default-role:: code

This page describes how to work with and create zoo models whose definitions
are hosted via GitHub repositories or public URLs.

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. note::

    Check out `voxel51/openai-clip <https://github.com/voxel51/openai-clip>`_
    and
    `voxel51/ultralytics-models <https://github.com/voxel51/ultralytics-models>`_
    for examples of remote model sources.

.. _model-zoo-remote-usage:

Working with remotely-sourced models
------------------------------------

Working with remotely-sourced zoo models is just like
:ref:`built-in zoo models <model-zoo-models>`, as both varieties support
the :ref:`full zoo API <model-zoo-api>`.

When specifying remote sources, you can provide any of the following:

-   A GitHub repo URL like ``https://github.com/<user>/<repo>``
-   A GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   A GitHub ref string like ``<user>/<repo>[/<ref>]``
-   A publicly accessible URL of an archive (eg zip or tar) file

Here's the basic recipe for working with remotely-sourced zoo models:

.. tabs::

  .. group-tab:: Python

    Use :meth:`register_zoo_model_source() <fiftyone.zoo.models.register_zoo_model_source>`
    to register a remote source of zoo models:

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        foz.register_zoo_model_source("https://github.com/voxel51/openai-clip")

    Use :meth:`list_zoo_model_sources() <fiftyone.zoo.models.list_zoo_model_sources>`
    to list all remote sources that have been registered locally:

    .. code-block:: python
        :linenos:

        remote_sources = foz.list_zoo_model_sources()

        print(remote_sources)
        # [..., "https://github.com/voxel51/openai-clip", ...]

    Once you've registered a remote source, any models that it
    :ref:`declares <model-zoo-remote-manifest>` will subsequently appear as
    available zoo models when you call
    :meth:`list_zoo_models() <fiftyone.zoo.models.list_zoo_models>`:

    .. code-block:: python
        :linenos:

        available_models = foz.list_zoo_models()

        print(available_models)
        # [..., "voxel51/clip-vit-base32-torch", ...]

    You can download a remote zoo model by calling
    :meth:`download_zoo_model() <fiftyone.zoo.models.download_zoo_model>`:

    .. code-block:: python
        :linenos:

        foz.download_zoo_model("voxel51/clip-vit-base32-torch")

    You can also directly download a remote zoo model and implicitly register
    its source via the following syntax:

    .. code-block:: python
        :linenos:

        foz.download_zoo_model(
            "https://github.com/voxel51/openai-clip",
            model_name="voxel51/clip-vit-base32-torch",
        )

    You can load a remote zoo model and apply it to a dataset or view via
    :meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>` and
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`:

    .. code-block:: python
        :linenos:

        dataset = foz.load_zoo_dataset("quickstart")
        model = foz.load_zoo_model("voxel51/clip-vit-base32-torch")

        dataset.apply_model(model, label_field="clip")

    You can delete the local copy of a remotely-sourced zoo model via
    :meth:`delete_zoo_model() <fiftyone.zoo.models.delete_zoo_model>`:

    .. code-block:: python
        :linenos:

        foz.delete_zoo_model("voxel51/clip-vit-base32-torch")

    You can unregister a remote source of zoo models and delete any local
    copies of models that it declares via
    :meth:`delete_zoo_model_source() <fiftyone.zoo.models.delete_zoo_model_source>`:

    .. code-block:: python
        :linenos:

        foz.delete_zoo_model_source("https://github.com/voxel51/openai-clip")

  .. group-tab:: CLI

    Use :ref:`fiftyone zoo models register-source <cli-fiftyone-zoo-models-register-source>`
    to register a remote source of zoo models:

    .. code-block:: shell

        fiftyone zoo models register-source \
            https://github.com/voxel51/openai-clip

    Use :ref:`fiftyone zoo models list-sources <cli-fiftyone-zoo-models-list-sources>`
    to list all remote sources that have been registered locally:

    .. code-block:: shell

        fiftyone zoo models list-sources

        # contains a row for 'https://github.com/voxel51/openai-clip'

    Once you've registered a remote source, any models that it
    :ref:`declares <model-zoo-remote-manifest>` will subsequently appear as
    available zoo models when you call
    :ref:`fiftyone zoo models list <cli-fiftyone-zoo-models-list>`:

    .. code-block:: shell

        fiftyone zoo models list

        # contains a row for 'voxel51/clip-vit-base32-torch'

    You can download a remote zoo model by calling
    :ref:`fiftyone zoo models download <cli-fiftyone-zoo-models-download>`:

    .. code-block:: shell

        fiftyone zoo models download voxel51/clip-vit-base32-torch

    You can also directly download a remote zoo model and implicitly register
    its source via the following syntax:

    .. code-block:: shell

        fiftyone zoo models \
            download https://github.com/voxel51/openai-clip \
            --model-name voxel51/clip-vit-base32-torch

    You can load a remote zoo model and apply it to a dataset via
    :ref:`fiftyone zoo models apply <cli-fiftyone-zoo-models-apply>`:

    .. code-block:: shell

        MODEL_NAME=voxel51/clip-vit-base32-torch
        DATASET_NAME=quickstart
        LABEL_FIELD=clip

        fiftyone zoo models apply $MODEL_NAME $DATASET_NAME $LABEL_FIELD

    You can delete the local copy of a remotely-sourced zoo model via
    :ref:`fiftyone zoo models delete <cli-fiftyone-zoo-models-delete>`:

    .. code-block:: shell

        fiftyone zoo models delete voxel51/clip-vit-base32-torch

    You can unregister a remote source of zoo models and delete any local
    copies of models that it declares via
    :ref:`fiftyone zoo models delete-source <cli-fiftyone-zoo-models-delete-source>`:

    .. code-block:: shell

        fiftyone zoo models delete-source https://github.com/voxel51/openai-clip

.. _model-zoo-remote-creation:

Creating remotely-sourced models
--------------------------------

A remote source of models is defined by a directory with the following contents:

.. code-block:: text

    manifest.json
    __init__.py
        def download_model(model_name, model_path):
            pass

        def load_model(model_name, model_path, **kwargs):
            pass

        def resolve_input(model_name, ctx):
            pass

        def parse_parameters(model_name, ctx, params):
            pass

Each component is described in detail below.

.. note::

    By convention, model sources also contain an optional `README.md` file that
    provides additional information about the models that it contains and
    example syntaxes for downloading and working with them.

.. _model-zoo-remote-manifest:

manifest.json
~~~~~~~~~~~~~

The remote source's `manifest.json` file defines relevant metadata about the
model(s) that it contains:

.. table::
    :widths: 20,10,70

    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | Field                            | Required? | Description                                                                               |
    +==================================+===========+===========================================================================================+
    | `base_name`                      | **yes**   | The base name of the model (no version info)                                              |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `base_filename`                  |           | The base filename or directory of the model (no version info), if applicable.             |
    |                                  |           |                                                                                           |
    |                                  |           | This is required in order for                                                             |
    |                                  |           | :meth:`list_downloaded_zoo_models() <fiftyone.zoo.models.list_downloaded_zoo_models>`     |
    |                                  |           | to detect the model and :meth:`delete_zoo_model() <fiftyone.zoo.models.delete_zoo_model>` |
    |                                  |           | to delete the local copy if it is downloaded                                              |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `author`                         |           | The author of the model                                                                   |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `version`                        |           | The version of the model (if applicable).                                                 |
    |                                  |           |                                                                                           |
    |                                  |           | If a version is provided, then users can refer to a specific version of the model by      |
    |                                  |           | appending ``@<ver>`` to its name when using methods like                                  |
    |                                  |           | :meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>`, otherwise the latest       |
    |                                  |           | version of the model is loaded by default                                                 |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `url`                            |           | The URL at which the model is hosted                                                      |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `license`                        |           | The license under which the model is distributed                                          |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `source`                         |           | The original source of the model                                                          |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `description`                    |           | A brief description of the model                                                          |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `tags`                           |           | A list of tags for the model. Useful in conjunction with                                  |
    |                                  |           | :meth:`list_zoo_models() <fiftyone.zoo.models.list_zoo_models>`                           |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `size_bytes`                     |           | The size of the model on disk                                                             |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `date_added`                     |           | The time that the model was added to the source                                           |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `requirements`                   |           | JSON description of the model's package/runtime requirements                              |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `manager`                        |           | A :class:`fiftyone.core.models.ModelManagerConfig` dict that describes the remote         |
    |                                  |           | location of the model and how to download it. If this is not provided, then a             |
    |                                  |           | :ref:`download_model() <model-zoo-remote-download-model>` function must be provided       |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `default_deployment_config_dict` |           | A :class:`fiftyone.core.models.ModelConfig` dict describing how to load the model. If     |
    |                                  |           | this is not provided, then a :ref:`load_model() <model-zoo-remote-load-model>` function   |
    |                                  |           | must be provided                                                                          |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+

It can also provide optional metadata about the remote source itself:

.. table::
    :widths: 20,10,70

    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | Field                            | Required? | Description                                                                               |
    +==================================+===========+===========================================================================================+
    | `name`                           |           | A name for the remote model source                                                        |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+
    | `url`                            |           | The URL of the remote model source                                                        |
    +----------------------------------+-----------+-------------------------------------------------------------------------------------------+

Here's an exaxmple model manifest file that declares a single model:

.. code-block:: json

    {
        "name": "voxel51/openai-clip",
        "url": "https://github.com/voxel51/openai-clip",
        "models": [
            {
                "base_name": "voxel51/clip-vit-base32-torch",
                "base_filename": "CLIP-ViT-B-32.pt",
                "author": "OpenAI",
                "license": "MIT",
                "source": "https://github.com/openai/CLIP",
                "description": "CLIP text/image encoder from Learning Transferable Visual Models From Natural Language Supervision (https://arxiv.org/abs/2103.00020) trained on 400M text-image pairs",
                "tags": [
                    "classification",
                    "logits",
                    "embeddings",
                    "torch",
                    "clip",
                    "zero-shot"
                ],
                "size_bytes": 353976522,
                "date_added": "2022-04-12 17:49:51",
                "requirements": {
                    "packages": ["torch", "torchvision"],
                    "cpu": {
                        "support": true
                    },
                    "gpu": {
                        "support": true
                    }
                }
            }
        ]
    }

.. _model-zoo-remote-download-model:

Download model
~~~~~~~~~~~~~~

If a remote source contains model(s) that don't use the ``manager`` key in its
:ref:`manifest <model-zoo-remote-manifest>`, then it must contain an
``__init__.py`` file that defines a ``download_model()`` method with the
signature below:

.. code-block:: python
    :linenos:

    def download_model(model_name, model_path):
        """Downloads the model.

        Args:
            model_name: the name of the model to download, as declared by the
                ``base_name`` and optional ``version`` fields of the manifest
            model_path: the absolute filename or directory to which to download the
                model, as declared by the ``base_filename`` field of the manifest
        """

        # Determine where to download `model_name` from
        url = ...

        # Download `url` to `model_path`
        ...

This method is called under-the-hood when a user calls
:meth:`download_zoo_model() <fiftyone.zoo.models.download_zoo_model>` or
:meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>`, and its job is
to download any relevant files from the web and organize and/or prepare
them as necessary at the provided path.

.. _model-zoo-remote-load-model:

Load model
~~~~~~~~~~

If a remote source contains model(s) that don't use the
``default_deployment_config_dict`` key in its
:ref:`manifest <model-zoo-remote-manifest>`, then it must contain an
``__init__.py`` file that defines a ``load_model()`` method with the signature
below:

.. code-block:: python
    :linenos:

    def load_model(model_name, model_path, **kwargs):
        """Loads the model.

        Args:
            model_name: the name of the model to load, as declared by the
                ``base_name`` and optional ``version`` fields of the manifest
            model_path: the absolute filename or directory to which the model was
                donwloaded, as declared by the ``base_filename`` field of the
                manifest
            **kwargs: optional keyword arguments that configure how the model
                is loaded

        Returns:
            a :class:`fiftyone.core.models.Model`
        """

        # The directory containing this file
        model_dir = os.path.dirname(model_path)

        # Consturct the specified `Model` instance, generally by importing
        # other modules in `model_dir`
        model = ...

        return model

This method's job is to load the |Model| instance for the specified model whose
associated weights are stored at the provided path.

.. note::

    Refer to :ref:`this page <model-zoo-design-overview>` for more information
    about wrapping models in the |Model| interface.

Remotely-sourced models can optionally support customized loading by accepting
optional keyword arguments to their ``load_model()`` method.

When
:meth:`load_zoo_model(name_or_url, ..., **kwargs) <fiftyone.zoo.models.load_zoo_model>`
is called, any `kwargs` are passed through to ``load_model(..., **kwargs)``.

.. _model-zoo-remote-resolve-input:

Resolve input
~~~~~~~~~~~~~

If a remote source contains model(s) that support custom parameters, then the
``__init__.py`` file can define a ``resolve_input()`` method with the
signature below that defines any necessary properties to collect the model's
custom parameters from a user when the model is invoked
:ref:`via an operator <using-operators>`:

.. code-block:: python
    :linenos:

    from fiftyone.operators import types

    def resolve_input(model_name, ctx):
        """Defines any necessary properties to collect the model's custom
        parameters from a user during prompting.

        Args:
            model_name: the name of the model, as declared by the ``base_name`` and
                optional ``version`` fields of the manifest
            ctx: an :class:`fiftyone.operators.ExecutionContext`

        Returns:
            a :class:`fiftyone.operators.types.Property`, or None
        """
        inputs = types.Object()
        inputs.list(
            "classes",
            types.String(),
            required=False,
            default=None,
            label="Zero shot classes",
            description=(
                "An optional list of custom classes for zero-shot prediction"
            ),
            view=types.AutocompleteView(),
        )
        return types.Property(inputs)

.. note::

    Refer to :ref:`this section <operator-inputs>` for more information about
    collecting user inputs for operators.

.. _model-zoo-remote-parse-parameters:

Parse parameters
~~~~~~~~~~~~~~~~

If a remote source contains model(s) that support custom parameters, then the
``__init__.py`` file can define a ``parse_parameters()`` method with the
signature below that performs any execution-time formatting to the model's
custom parameters when the model is invoked
:ref:`via an operator <using-operators>`:

.. code-block:: python
    :linenos:

    def parse_parameters(model_name, ctx, params):
        """Performs any execution-time formatting to the model's custom parameters.

        Args:
            model_name: the name of the model, as declared by the ``base_name`` and
                optional ``version`` fields of the manifest
            ctx: an :class:`fiftyone.operators.ExecutionContext`
            params: a params dict
        """
        classes = params.get("classes", None)
        if isinstance(classes, str):
            params["classes"] = classes.split(",")

.. note::

    Refer to :ref:`this section <operator-inputs>` for more information about
    collecting user inputs for operators.
