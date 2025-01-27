.. _dataset-zoo-remote:

Remotely-Sourced Zoo Datasets
=============================

.. default-role:: code

This page describes how to work with and create zoo datasets whose
download/preparation methods are hosted via GitHub repositories or public URLs.

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. note::

    Check out `voxel51/coco-2017 <https://github.com/voxel51/coco-2017>`_ and
    `voxel51/caltech101 <https://github.com/voxel51/caltech101>`_ for examples
    of remotely-sourced datasets.

.. _dataset-zoo-remote-usage:

Working with remotely-sourced datasets
--------------------------------------

Working with remotely-sourced zoo datasets is just like
:ref:`built-in zoo datasets <dataset-zoo-datasets>`, as both varieties support
the :ref:`full zoo API <dataset-zoo-api>`.

When specifying remote sources, you can provide any of the following:

-   A GitHub repo URL like ``https://github.com/<user>/<repo>``
-   A GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   A GitHub ref string like ``<user>/<repo>[/<ref>]``
-   A publicly accessible URL of an archive (eg zip or tar) file

Here's the basic recipe for working with remotely-sourced zoo datasets:

.. tabs::

  .. group-tab:: Python

    Use :meth:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>` to
    download and load a remotely-sourced zoo dataset into a FiftyOne dataset:

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "https://github.com/voxel51/coco-2017",
            split="validation",
        )

        session = fo.launch_app(dataset)

    Once you've downloaded all or part of a remotely-sourced zoo dataset, it
    will subsequently appear as an available zoo dataset under the name in the
    dataset's :ref:`fiftyone.yml <zoo-dataset-remote-fiftyone-yml>` when you
    call :meth:`list_zoo_datasets() <fiftyone.zoo.datasets.list_zoo_datasets>`:

    .. code-block:: python
        :linenos:

        available_datasets = foz.list_zoo_datasets()

        print(available_datasets)
        # [..., "voxel51/coco-2017", ...]

    You can also download a remotely-sourced zoo dataset without (yet) loading
    it into a FiftyOne dataset by calling
    :meth:`download_zoo_dataset() <fiftyone.zoo.datasets.download_zoo_dataset>`:

    .. code-block:: python
        :linenos:

        dataset = foz.download_zoo_dataset(
            "https://github.com/voxel51/coco-2017",
            split="validation",
        )

    You can delete the local copy of a remotely-sourced zoo dataset (or
    individual split(s) of it) via
    :meth:`delete_zoo_dataset() <fiftyone.zoo.datasets.delete_zoo_dataset>`
    by providing either the datasets's name or the remote source from which
    you downloaded it:

    .. code-block:: python
        :linenos:

        # These are equivalent
        foz.delete_zoo_dataset("voxel51/coco-2017", split="validation")
        foz.delete_zoo_dataset(
            "https://github.com/voxel51/coco-2017", split="validation"
        )

        # These are equivalent
        foz.delete_zoo_dataset("voxel51/coco-2017")
        foz.delete_zoo_dataset("https://github.com/voxel51/coco-2017")

  .. group-tab:: CLI

    Use :ref:`fiftyone zoo datasets load <cli-fiftyone-zoo-datasets-load>` to
    load a remotely-sourced zoo dataset into a FiftyOne dataset:

    .. code-block:: shell

        fiftyone zoo datasets load \
            https://github.com/voxel51/coco-2017 \
            --split validation \
            --dataset-name 'voxel51/coco-2017-validation'

        fiftyone app launch 'voxel51/coco-2017-validation'

    Once you've downloaded all or part of a remotely-sourced zoo dataset, it
    will subsequently appear as an available zoo dataset under the name in the
    dataset's :ref:`fiftyone.yml <zoo-dataset-remote-fiftyone-yml>` when you
    call :ref:`fiftyone zoo datasets list <cli-fiftyone-zoo-datasets-list>`:

    .. code-block:: shell

        fiftyone zoo datasets list

        # contains row(s) for a dataset 'voxel51/coco-2017'

    You can also download a remotely-sourced zoo dataset without (yet) loading
    it into a FiftyOne dataset by calling
    :ref:`fiftyone zoo datasets download <cli-fiftyone-zoo-datasets-download>`:

    .. code-block:: shell

        fiftyone zoo datasets download \
            https://github.com/voxel51/coco-2017 \
            --split validation

    You can delete the local copy of a remotely-sourced zoo dataset (or
    individual split(s) of it) via
    :ref:`fiftyone zoo datasets delete <cli-fiftyone-zoo-datasets-delete>`
    by providing either the datasets's name or the remote source from which
    you downloaded it:

    .. code-block:: shell

        # These are equivalent
        fiftyone zoo datasets delete voxel51/coco-2017 --split validation
        fiftyone zoo datasets delete \
            https://github.com/voxel51/coco-2017 --split validation

        # These are equivalent
        fiftyone zoo datasets delete voxel51/coco-2017
        fiftyone zoo datasets delete https://github.com/voxel51/coco-2017

.. _dataset-zoo-remote-creation:

Creating remotely-sourced datasets
----------------------------------

A remotely-sourced dataset is defined by a directory with the following
contents:

.. code-block:: text

    fiftyone.yml
    __init__.py
        def download_and_prepare(dataset_dir, split=None, **kwargs):
            pass

        def load_dataset(dataset, dataset_dir, split=None, **kwargs):
            pass

Each component is described in detail below.

.. note::

    By convention, datasets also contain an optional `README.md` file that
    provides additional information about the dataset and example syntaxes for
    downloading and working with it.

.. _zoo-dataset-remote-fiftyone-yml:

fiftyone.yml
~~~~~~~~~~~~

The dataset's `fiftyone.yml` or `fiftyone.yaml` file defines relevant metadata
about the dataset:

.. table::
    :widths: 20,10,70

    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | Field                        | Required? | Description                                                                 |
    +==============================+===========+=============================================================================+
    | `name`                       | **yes**   | The name of the dataset. Once you've downloaded all or part of a            |
    |                              |           | remotely-sourced zoo dataset, it will subsequently appear as an available   |
    |                              |           | zoo dataset under this name when using the                                  |
    |                              |           | :ref:`zoo API <dataset-zoo-api>`                                            |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `type`                       |           | Declare that the directory defines a `dataset`. This can be omitted for     |
    |                              |           | backwards compatibility, but it is recommended to specify this              |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `author`                     |           | The author of the dataset                                                   |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `version`                    |           | The version of the dataset                                                  |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `url`                        |           | The source (eg GitHub repository) where the directory containing this file  |
    |                              |           | is hosted                                                                   |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `source`                     |           | The original source of the dataset                                          |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `license`                    |           | The license under which the dataset is distributed                          |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `description`                |           | A brief description of the dataset                                          |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `fiftyone.version`           |           | A semver version specifier (or `*`) describing the required                 |
    |                              |           | FiftyOne version for the dataset to load properly                           |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `supports_partial_downloads` |           | Specify `true` or `false` whether parts of the dataset can be               |
    |                              |           | downloaded/loaded by providing `kwargs` to                                  |
    |                              |           | :meth:`download_zoo_dataset() <fiftyone.zoo.datasets.download_zoo_dataset>` |
    |                              |           | or :meth:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>` as   |
    |                              |           | :ref:`described here <dataset-zoo-remote-partial-downloads>`. If omitted,   |
    |                              |           | this is assumed to be `false`                                               |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `tags`                       |           | A list of tags for the dataset. Useful in conjunction with                  |
    |                              |           | :meth:`list_zoo_datasets() <fiftyone.zoo.datasets.list_zoo_datasets>`       |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `splits`                     |           | A list of the dataset's supported splits. This should be omitted if the     |
    |                              |           | dataset does not contain splits                                             |
    +------------------------------+-----------+-----------------------------------------------------------------------------+
    | `size_samples`               |           | The totaal number of samples in the dataset, or a list of per-split sizes   |
    +------------------------------+-----------+-----------------------------------------------------------------------------+

Here are two example dataset YAML files:

.. tabs::

  .. group-tab:: Dataset with splits

    .. code-block:: yaml
        :linenos:

        name: voxel51/coco-2017
        type: dataset
        author: The COCO Consortium
        version: 1.0.0
        url: https://github.com/voxel51/coco-2017
        source: http://cocodataset.org/#home
        license: https://cocodataset.org/#termsofuse
        description: The COCO-2017 dataset
        fiftyone:
          version: "*"
        supports_partial_downloads: true
        tags:
         - image
         - detection
         - segmentation
        splits:
         - train
         - validation
         - test
        size_samples:
         - train: 118287
         - test: 40670
         - validation: 5000

  .. group-tab:: Dataset without splits

    .. code-block:: yaml
        :linenos:

        name: voxel51/caltech101
        type: dataset
        author: Fei-Fei1 Li, Marco Andreeto, Marc'Aurelio Ranzato, Pietro Perona
        version: 1.0.0
        url: https://github.com/voxel51/caltech101
        source: https://data.caltech.edu/records/mzrjq-6wc02
        license: Creative Commons Attribution 4.0 International
        description: The Caltech 101 dataset
        fiftyone:
          version: "*"
        supports_partial_downloads: false
        tags:
         - image
         - classification
        size_samples: 9145

Download and prepare
~~~~~~~~~~~~~~~~~~~~

All dataset's ``__init__.py`` files must define a ``download_and_prepare()``
method with the signature below:

.. code-block:: python
    :linenos:

    def download_and_prepare(dataset_dir, split=None, **kwargs):
        """Downloads the dataset and prepares it for loading into FiftyOne.

        Args:
            dataset_dir: the directory in which to construct the dataset
            split (None): a specific split to download, if the dataset supports
                splits. The supported split values are defined by the dataset's
                YAML file
            **kwargs: optional keyword arguments that your dataset can define to
                configure what/how the download is performed

        Returns:
            a tuple of

            -   ``dataset_type``: a ``fiftyone.types.Dataset`` type that the
                dataset is stored in locally, or None if the dataset provides
                its own ``load_dataset()`` method
            -   ``num_samples``: the total number of downloaded samples for the
                dataset or split
            -   ``classes``: a list of classes in the dataset, or None if not
                applicable
        """

        # Download files and organize them in `dataset_dir`
        ...

        # Define how the data is stored
        dataset_type = fo.types.ImageClassificationDirectoryTree
        dataset_type = None  # custom ``load_dataset()`` method

        # Indicate how many samples have been downloaded
        # May be less than the total size if partial downloads have been used
        num_samples = 10000

        # Optionally report what classes exist in the dataset
        classes = None
        classes = ["cat", "dog", ...]

        return dataset_type, num_samples, classes

This method is called under-the-hood when a user calls
:meth:`download_zoo_dataset() <fiftyone.zoo.datasets.download_zoo_dataset>` or
:meth:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`, and its
job is to download any relevant files from the web and organize and/or prepare
them as necessary into a format that's ready to be loaded into a FiftyOne
dataset.

The ``dataset_type`` that ``download_and_prepare()`` returns defines how it the
dataset is ultimately loaded into FiftyOne:

-   **Built-in importer**: in many cases, FiftyOne already contains a
    :ref:`built-in importer <supported-import-formats>` that can be leveraged
    to load data on disk into FiftyOne. Remotely-sourced datasets can take
    advantage of this by simply returning the appropriate ``dataset_type`` from
    ``download_and_prepare()``, which is then used to load the data into
    FiftyOne as follows:

.. code-block:: python
    :linenos:

    # If the dataset has splits, `dataset_dir` will be the split directory
    dataset_importer_cls = dataset_type.get_dataset_importer_cls()
    dataset_importer = dataset_importer_cls(dataset_dir=dataset_dir, **kwargs)

    dataset.add_importer(dataset_importer, **kwargs)

-   **Custom loader**: if ``dataset_type=None`` is returned, then
    ``__init__.py`` must also contain a ``load_dataset()`` method as described
    below that handles loading the data into FiftyOne as follows:

.. code-block:: python
    :linenos:

    load_dataset(dataset, dataset_dir, **kwargs)

Load dataset
~~~~~~~~~~~~

Datasets that don't use a built-in importer must also define a
``load_dataset()`` method in their ``__init__.py`` with the signature below:

.. code-block:: python
    :linenos:

    def load_dataset(dataset, dataset_dir, split=None, **kwargs):
        """Loads the dataset into the given FiftyOne dataset.

        Args:
            dataset: a :class:`fiftyone.core.dataset.Dataset` to which to import
            dataset_dir: the directory to which the dataset was downloaded
            split (None): a split to load. The supported values are
                ``("train", "validation", "test")``
            **kwargs: optional keyword arguments that your dataset can define to
                configure what/how the load is performed
        """

        # Load data into samples
        samples = [...]

        # Add samples to the dataset
        dataset.add_samples(samples)

This method's job is to load the filepaths and any relevant labels into
|Sample| objects and then call
:meth:`add_samples() <fiftyone.core.dataset.Dataset.add_samples>` or a similar
method to add them to the provided |Dataset|.

.. _dataset-zoo-remote-partial-downloads:

Partial downloads
-----------------

Remotely-sourced datasets can support partial downloads, which is useful for a
variety of reasons, including:

-   A dataset may contain labels for multiple task types but the user is only
    interested in a subset of them
-   The dataset may be very large and the user only wants to download a small
    subset of the samples to get familiar with the dataset

Datasets that support partial downloads should declare this in their
:ref:`fiftyone.yml <zoo-dataset-remote-fiftyone-yml>`:

.. code-block:: yaml

    supports_partial_downloads: true

The partial download behavior itself is defined via ``**kwargs`` in the
dataset's ``__init__.py`` methods:

.. code-block:: python
    :linenos:

    def download_and_prepare(dataset_dir, split=None, **kwargs):
        pass

    def load_dataset(dataset, dataset_dir, split=None, **kwargs):
        pass

When
:meth:`download_zoo_dataset(url, ..., **kwargs) <fiftyone.zoo.datasets.download_zoo_dataset>`
is called, any `kwargs` declared by ``download_and_prepare()`` are passed
through to it.

When
:meth:`load_zoo_dataset(name_or_url, ..., **kwargs) <fiftyone.zoo.datasets.load_zoo_dataset>`
is called, any `kwargs` declared by ``download_and_prepare()`` and
``load_dataset()`` are passed through to them, respectively.
