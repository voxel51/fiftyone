.. _terminology-cheat-sheet:

FiftyOne terminology
====================

.. default-role:: code

A cheat sheet introducing you to the key terminology in the world of FiftyOne!

The basics
__________

.. list-table::
   :widths: 20 80

   * - **FiftyOne**
     - The :ref:`open-source framework <fiftyone-library>`, the core library, and the Python SDK
   * - **FiftyOne App**
     - | The :ref:`GUI attached to FiftyOne <fiftyone-app>` for graphically viewing, filtering, and understanding 
       | your computer vision data. Can be launched within an IPython notebook, 
       | in the browser, or as a standalone desktop app.
   * - **FiftyOne Teams**
     - | `The enterprise-grade suite <https://voxel51.com/fiftyone-teams/>`_ built on top of FiftyOne for collaboration,
       | permissioning, and working with cloud-backed media

FiftyOne components
___________________

.. list-table::
   :widths: 20 80

   * - **Brain**
     - Library of :ref:`ML-powered capabilities <fiftyone-brain>` for computation and visualization
   * - **Dataset Zoo**
     - | :ref:`Collection of common datasets <dataset-zoo>` available for download and loading into 
       | FiftyOne
   * - **Model Zoo**
     - :ref:`Collection of pre-trained models <model-zoo>` available for download and inference
   * - **Plugin**
     - A module you can use to :ref:`customize and extend the behavior of FiftyOne <app-plugins>`
   * - **Integration**
     - | A dataset, ML framework, annotation service, or other tool FiftyOne is 
       | :ref:`directly compatible with <integrations>`

Data model
__________

.. list-table::
   :widths: 20 80

   * - **Sample**
     - | The atomic elements of a ``Dataset`` that store all the information 
       | related to a given piece of data. Every :ref:`sample <basics-samples>` has an associated 
       | media file. Computer vision analog of row in a table
   * - **Dataset**
     - | :ref:`Core data structure <basics-datasets>` in FiftyOne, composed of ``Samples``. Consistent
       | interface for loading images, videos, annotations, and predictions.
       | Computer vision analog of a table of data
   * - **DatasetView**
     - | :ref:`A view into <using-views>` a ``Dataset``, which can be filtered, sorted, sampled, etc. 
       | along various axes to obtain a desired subset of the samples
   * - **ViewStage**
     - | :ref:`A logical operation <view-stages>`, such as filtering, matching, or sorting, which can
       | be used to generate a ``DatasetView``
   * - **Field**
     - | Attributes of ``Sample`` instances that :ref:`store customizable information <basics-fields>`
       |  about the samples. Computer vision analog of a column in a table
   * - **Embedded Field**
     - | :ref:`A collection of related fields <custom-embedded-documents>` organized under a single top-level
       | ``Field``, similar to a nested dictionary
   * - **Label**
     - | Class hierarchy used to :ref:`store semantic information <basics-labels>` about ground truth
       | or predicted labels in a sample. Built in ``Label`` types include 
       | ``Detections``, ``Classification``, and ``Keypoints`` among others
   * - **Tag**
     - | A field containing a list of strings representing relevant information.
       | :ref:`Tags <basics-tags>` can be on the dataset, sample, or label level
   * - **Metadata**
     - | A ``Sample`` level field which can optionally store data type-specific
       | :ref:`metadata <basics-metadata>` about the raw data in the sample
   * - **Aggregation**
     - | A class encapsulating the computation of an :ref:`aggregate statistic <basics-aggregations>` about a
       | dataset

FiftyOne App
____________

.. list-table::
   :widths: 20 80

   * - **Session**
     - | :ref:`An instance of the FiftyOne App <app-sessions>` connected to a specific dataset, via
       | which you can use to programmatically interact with the app.
   * - **Sample grid**
     - | The rectangular :ref:`grid of images or videos <app-filtering>` you can scroll through. You 
       | can click on any image or video in the grid to expand
   * - **Sidebar**
     - | Vertical component on :ref:`left side of app <app-fields-sidebar>` which allows for toggling labels on/off, 
       | filtering by class or id, or by numerical value ranges
   * - **Viewbar**
     - | :ref:`Horizontal bar at the top of the app <app-create-view>` where you can create and compose
       | view stages via point and click operations
