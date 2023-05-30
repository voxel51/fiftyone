.. _terminology-cheat-sheet:

FiftyOne terminology
====================

.. default-role:: code

This cheat sheet introduces the key terminology in the world of FiftyOne.

The basics
__________

.. list-table::
   :widths: 20 80

   * - FiftyOne
     - The :ref:`open-source framework <fiftyone-library>`, the core library,
       and the Python SDK.
   * - FiftyOne App
     - The :ref:`provided user interface <fiftyone-app>` for graphically
       viewing, filtering, and understanding your datasets. Can be launched in
       the browser, within notebooks, or as a standalone desktop app.
   * - FiftyOne Teams
     - `The enterprise-grade suite <https://voxel51.com/fiftyone-teams/>`_
       built on top of FiftyOne for collaboration, permissioning, and working
       with cloud-backed media.

Other components
________________

.. list-table::
   :widths: 20 80

   * - Brain
     - Library of :ref:`ML-powered capabilities <fiftyone-brain>` for
       computation and visualization.
   * - Dataset Zoo
     - :ref:`Collection of common datasets <dataset-zoo>` available for
       download and loading into  FiftyOne.
   * - Model Zoo
     - :ref:`Collection of pre-trained models <model-zoo>` available for
       download and inference.
   * - Plugin
     - A module you can use to :ref:`customize and extend <fiftyone-plugins>`
       the behavior of FiftyOne.
   * - Operator
     - A :ref:`plugin subcomponent <fiftyone-operators>` that defines an
       operation that can be executed either directly by users in the App
       and/or internally invoked by other plugin components
   * - Integration
     - A dataset, ML framework, annotation service, or other tool FiftyOne is
       :ref:`directly compatible with <integrations>`.

Data model
__________

.. list-table::
   :widths: 20 80

   * - Dataset
     - :ref:`Core data structure <basics-datasets>` in FiftyOne, composed of
       `Sample` instances. Provides a consistent interface for loading
       images, videos, metadata, annotations, and predictions. The computer
       vision analog of a table of data.
   * - Sample
     - The atomic elements of a `Dataset` that store all the information
       related to a given piece of data. Every :ref:`sample <basics-samples>`
       has an associated media file. The computer vision analog of a row of
       tabular data.
   * - DatasetView
     - :ref:`A view into <using-views>` a `Dataset`, which can filter,
       sort, transform, etc. the dataset along various axes to obtain a
       desired subset of the samples.
   * - ViewStage
     - :ref:`A logical operation <view-stages>`, such as filtering, matching,
       or sorting, which can be used to generate a `DatasetView`.
   * - Field
     - Attributes of `Sample` instances that
       :ref:`store customizable information <basics-fields>` about the
       samples. The computer vision analog of a column in a table.
   * - Embedded Document Field
     - :ref:`A collection of related fields <custom-embedded-documents>`
       organized under a single top-level `Field`, similar to a nested
       dictionary.
   * - Label
     - Class hierarchy used to
       :ref:`store semantic information <basics-labels>` about ground truth
       or predicted labels in a sample. Builtin `Label` types include
       `Classification`, `Detections`, `Keypoints`, and many others.
   * - Tag
     - A field containing a list of strings representing relevant
       information. :ref:`Tags <basics-tags>` can be assigned to datasets,
       samples, or labels.
   * - Metadata
     - A special `Sample` field that can be automatically populated with
       media type-specific  :ref:`metadata <basics-metadata>` about the raw
       media associated with the sample.
   * - Aggregation
     - A class encapsulating the computation of an
       :ref:`aggregate statistic <basics-aggregations>` about the contents of
       a dataset or view.

FiftyOne App
____________

.. list-table::
   :widths: 20 80

   * - Session
     - :ref:`An instance of the FiftyOne App <app-sessions>` connected to a
       specific dataset, via which you can use to programmatically interact
       with the App.
   * - Sample grid
     - The rectangular :ref:`media grid <app-filtering>` that you can scroll
       through to quickly browse the samples in a dataset. Click on any media
       in the grid to open the sample modal.
   * - Sample modal
     - The :ref:`expanded modal <app-sample-view>` that provides detailed
       information and visualization about an individual sample in a dataset.
   * - Sidebar
     - Vertical component on :ref:`left side of App <app-fields-sidebar>`
       that provides convenient options for filtering the dataset and
       toggling the visibility of fields in the sample grid.
   * - View bar
     - :ref:`Horizontal bar at the top of the App <app-create-view>` where
       you can create and compose view stages via point and click operations
       to filter your dataset and show only the content of interest.
