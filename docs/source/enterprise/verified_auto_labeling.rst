.. _verified-auto-labeling:

Verified Auto-Labeling
======================

.. default-role:: code

Verified Auto-Labeling (VAL) is a feature built into the
:ref:`FiftyOne Enterprise App <enterprise-app>`
which allows you to automatically generate
:ref:`classification <classification>`,
:ref:`detection, and instance segmentation <object-detection>`
labels for your samples using state-of-the-art models.

VAL is powered by
:ref:`delegated operations <enterprise-delegated-operations>`,
enabling you to perform auto-labeling in the background using your existing GPU
infrastructure.

.. _verified-auto-labeling-how-it-works:

How it works
____________

1. **Configure auto-labeling**
    Tailor the run configuration to the specific needs of your dataset and
    task. Choose your models, define your classes of interest, and provide
    optional model configuration.

2. **Generate labels**
    Run auto-labeling using a configured
    :ref:`orchestrator <enterprise-delegated-orchestrator>`. Your auto-labeling
    configuration will be executed in the background, and the VAL panel will
    automatically update as label generation progresses.

3. **Review generated labels**
    Use the VAL panel alongside the samples grid to interactively review the
    generated labels. Leverage standard sample and label filters, model
    confidence thresholds, and tools like the
    :ref:`embeddings visualizer <brain-embeddings-visualization>`
    to identify high-quality labels. Labels which are approved are added to
    your samples, and unapproved labels are automatically discarded.

.. _verified-auto-labeling-white-paper:

The science behind the labels
--------------------------

Our auto-labeling process produces results comparable to human-provided
annotation. Continued model and process improvements contribute to enhanced
generation and validation capabilities.

For more information on auto-labeling performance, review the
`auto-labeling whitepaper <https://voxel51.com/whitepapers/auto-labeling-data-for-object-detection>`_.

.. _verified-auto-labeling-user-guide:

User Guide
__________

.. _verified-auto-labeling-getting-started:

Getting started
---------------

To get started with Verified Auto-Labeling, simply open the VAL panel by
selecting Auto Labeling from the new panel menu above the sample grid.

.. note::

    Verified Auto-Labeling currently supports image and 3D datasets. For other
    media types, the VAL panel will be disabled for the dataset.

.. note::

    Since Verified Auto-Labeling modifies samples in the dataset, the VAL panel
    is only available to users with edit permissions on the dataset.

The VAL experience is specific to each dataset, meaning your auto-labeling
runs will exist in isolation from other datasets.

.. _verified-auto-labeling-run-list:

Viewing auto-labeling runs
--------------------------

If you or your team members have run auto-labeling on the current dataset, the
VAL panel will display a list of all associated runs. If auto-labeling has not
yet been used on the dataset, you can get started by clicking on the
**Auto Label** button in the VAL panel. Learn more about
:ref:`configuring a run <verified-auto-labeling-run-config>`.

.. image:: /images/enterprise/val_home_empty.png
    :alt: verified-auto-labeling-home
    :align: center

.. _verified-auto-labeling-run-config:

Configuring an auto-labeling run
--------------------------------

The VAL panel provides several configuration options to tailor the
auto-labeling experience to your specific needs. Choose the samples you want
to label, select appropriate models for the task, and provide optional model
configuration.

.. _verified-auto-labeling-sample-selection:

Selecting target samples
^^^^^^^^^^^^^^^^^^^^^^^^

The first step in the configuration process is to identify the set of samples
for which to generate labels.

.. image:: /images/enterprise/val_sample_target_selection.png
    :alt: verified-auto-labeling-sample-target-selection
    :align: center

**All samples** - Auto-labeling will be run on each sample in the dataset.

**Current view** - Auto-labeling will be run on samples in
:ref:`the current view <using-views>`. Leverage standard app functionality to
filter samples to the desired subset.

**Current selection** - Auto-labeling will be run on
:ref:`currently-selected samples <app-select-samples>`. Use this option to
experiment with label generation on a small number of samples, or select in
bulk using a set of sample IDs.

.. _verified-auto-labeling-model-selection:

Selecting models
^^^^^^^^^^^^^^^^

.. _verified-auto-labeling-task-type:

Task type
"""""""""

The task type controls the type of label which will be generated.

.. image:: /images/enterprise/val_model_selection_task_type.png
    :alt: verified-auto-labeling-model-selection-task-type
    :align: center

**Classification** - each sample will be augmented with a
:ref:`classification label <classification>` from the set of configured
classes.

**Detection** - each sample will be augmented with a list of
:ref:`detections <object-detection>` from the set of configured classes.

**Instance segmentation** - each sample will be augmented with a list of
:ref:`detections <object-detection>` from the set of configured classes. Each
detection will include an instance segmentation mask.

.. note::

    For **detection** and **instance segmentation** tasks, there is no upper
    bound on the number of detections which can be generated. We strongly
    recommend setting an appropriate threshold for the model confidence to
    reduce the number of low-quality labels. See
    :ref:`run settings <verified-auto-labeling-run-settings>`
    for more information.

.. _verified-auto-labeling-pipeline-method:

Method
""""""

For **instance segmentation** tasks, there are two logical operations: detection
then segmentation. For this task type, you can choose to use a single model,
multiple models, or even start with existing detections.

.. image:: /images/enterprise/val_model_selection_instance_segmentation.png
    :alt: verified-auto-labeling-model-selection-instance-segmentation
    :align: center

**One-stage model** - this option will allow you to select a single model which
will be responsible for both detection and segmentation of each instance.

**Two-stage model** - this option will allow you to select a dedicated
detection model alongside a dedicated segmentation model.

**Existing detections** - this option will leverage existing detections on your
samples, and will enable you to select a model to use for segmentation. Once
this option is selected, you will be presented with a dropdown view of eligible
sample fields to choose from.

.. note::

    This configuration option is only applicable for **instance segmentation**
    tasks.

.. _verified-auto-labeling-model-type:

Model type
""""""""""

The model type controls whether a zero-shot or fixed-vocabulary model will be
used for label generation.

.. image:: /images/enterprise/val_model_selection_model_type.png
    :alt: verified-auto-labeling-model-selection-model-type
    :align: center

**Zero-shot** - zero-shot models are trained on a broad range of data, and can
be prompted with arbitrary classes to generate labels.

**Fixed vocabulary** - fixed-vocabulary models are trained on a specific set of
classes, most often from a specific dataset (such as COCO or ResNet). These
models offer strong performance for known classes available for selection, but
cannot be prompted with arbitrary classes.

.. _verified-auto-labeling-model:

Model
"""""

The models available to you are automatically filtered based on the
configuration provided in the
:ref:`task type <verified-auto-labeling-task-type>`,
:ref:`method <verified-auto-labeling-pipeline-method>`,
and
:ref:`model type <verified-auto-labeling-model-type>`
controls.

.. image:: /images/enterprise/val_model_selection_model.png
    :alt: verified-auto-labeling-model-selection-model
    :align: center

From the set of compatible models, you can select the model family (e.g. "yolo"
or "segment-anything"), the model version (e.g. "11-coco-torch"), and the model
size (e.g. "medium").

For the currently-selected model, you are able to see additional metadata,
including a brief description, author and license information, and a link to
additional details.

The model metadata also includes approximate speed and performance metrics.
These values (each a range from 1 to 3) indicate the model's speed
(inference time) and performance (inference accuracy) relative to other
comparable models. Higher values indicate faster inference and improved
accuracy, respectively.

.. _verified-auto-labeling-defining-classes:

Defining classes
^^^^^^^^^^^^^^^^

To tailor the auto-labeling process to your dataset, you can provide a specific
set of classes for the models to consider.

.. image:: /images/enterprise/val_classes_fixed_vocabulary.png
    :alt: verified-auto-labeling-class-selection
    :align: center

For **zero-shot** models, you must provide at least one class. There is no
upper bound on the number of classes you can provide.

For **fixed-vocabulary** models, you will be presented with a dropdown view of
the model's known classes. You can optionally select a subset of classes
from the model's vocabulary. If you do not select any classes, all
classes in the model's vocabulary will be used.

.. _verified-auto-labeling-run-settings:

Run settings
^^^^^^^^^^^^

The run settings allow you to provide additional metadata to finish configuring
the run.

.. image:: /images/enterprise/val_run_settings.png
    :alt: verified-auto-labeling-run-settings
    :align: center

**Label field** - the name of the field in which to store generated labels.
This must be a new field. To use an existing field, see
:ref:`analyzing existing labels <verified-auto-labeling-analyze-existing>`.

**Minimum confidence in results** - (optional) the minimum confidence threshold
to be used in model inference. Any labels below this confidence will be
excluded from the results. For some families of models, a default value will
be set as recommended by the model provider.

**Mask output location** - (required for segmentation tasks) the file system
location where segmentation masks should be written. This will allow you to
browse all of FiftyOne's configured filesystems, including any cloud storage.
Segmentation masks will be written to this location, and a reference to the
mask will be stored in the `mask_path` label attribute.

**Run name** - (optional) a human-friendly name for the auto-labeling run.
This name will be shown throughout the VAL panel, and can be changed at any
time. If not provided, a unique identifier will be generated by the system.

**Speed-up processing** - VAL provides support for concurrent execution across
multiple workers. Increasing this value will allow for VAL to generate labels
in parallel up to your maximum allowable concurrency.

.. _verified-auto-labeling-tracking-progress:

Tracking auto-labeling progress
-------------------------------

While the associated delegated operation runs in the background, the VAL panel
will automatically update auto-labeling runs with new data as it becomes
available. While an auto-labeling run has the **Generating** status, clicking
on the run card will display metadata about the run and will include a link to
view the delegated operation.

.. image:: /images/enterprise/val_generation_in_progress.png
    :alt: verified-auto-labeling-generation-in-progress
    :align: center

Clicking this link will allow you to view detailed progress information,
including an estimated completion percentage.

.. image:: /images/enterprise/val_pipeline_in_progress.png
    :alt: verified-auto-labeling-pipeline-in-progress
    :align: center

Once the delegated operation completes, the auto-labeling run will transition
to the **In Review** status, at which point the generated labels can be
reviewed and approved.

.. _verified-auto-labeling-analyze-existing:

Analyzing existing labels
-------------------------

Verified Auto-Labeling can also be used to review the quality of existing
labels in your dataset. To import existing labels, navigate to the
:ref:`VAL home screen <verified-auto-labeling-run-list>` and click
**Analyze existing labels** at the top of the panel.

.. image:: /images/enterprise/val_analyze_existing_labels.png
    :alt: verified-auto-labeling-analyze-existing-labels
    :align: center

.. _verified-auto-labeling-importing-labels:

Importing labels
^^^^^^^^^^^^^^^^

To import labels into the VAL panel, simply select your label field from the
dropdown menu. VAL supports :ref:`classification <classification>`,
:ref:`detection, and instance segmentation <object-detection>` fields.

.. note::

    To import labels into VAL, at least one label instance is required to have
    a ``confidence`` attribute defined on the label. This field should contain
    floating-point value between 0 and 1.

Once you have selected the source field, click the **Analyze labels** button
to start the import process. Once the import is complete, you can leverage the
:ref:`VAL label review process <verified-auto-labeling-label-review>`
to improve your annotation quality.

.. _verified-auto-labeling-run-anatomy:

Anatomy of an auto-labeling run
-------------------------------

.. image:: /images/enterprise/val_run_card.png
    :alt: verified-auto-labeling-run-card
    :align: center

**Run Status**

An auto-labeling run can have one of the following statuses:

* **Generating**
    The run has been scheduled for execution, or label generation is in
    progress. Read more about
    :ref:`tracking auto-labeling progress <verified-auto-labeling-tracking-progress>`.
* **In Review**
    Label generation has completed, and the labels are ready for review. As
    long as the run is **In Review**, labels can be promoted for approval.
    Read more about
    :ref:`reviewing generated labels <verified-auto-labeling-label-review>`.
* **Approved**
    The VAL run has gone through the label review process, and selected labels
    were added to the samples. This is a terminal state for a VAL run; to
    generate and review additional labels,
    :ref:`configure a new run <verified-auto-labeling-run-config>`.
* **Error**
    The VAL run encountered an error during label generation. Review the error
    message to determine next steps.

**classes** - the number of unique classes generated by auto-labeling.

**labels** - the total number of labels generated by auto-labeling.

.. _verified-auto-labeling-resume-run:

Resuming a failed auto-labeling run
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

In the event that an auto-labeling run fails or samples are not processed
correctly, the VAL panel offers the option to resume the run. After selecting
this option, the VAL panel will schedule a new delegated operation in which
the auto-labeling process will continue from where it left off. Any samples
for which labels have already been generated will be skipped, and the
remaining samples will have labels generated.

If you don't want to resume the run, you can dismiss the option by clicking
**Skip and continue review**.

.. image:: /images/enterprise/val_resume_labeling.png
    :alt: verified-auto-labeling-resume-labeling
    :align: center

.. _verified-auto-labeling-label-review:

Reviewing generated labels
--------------------------

Once your auto-labeling run is complete, it will enter the **In Review**
status. Clicking on the run card will bring you to the label review screen.

.. image:: /images/enterprise/val_label_review.png
    :alt: verified-auto-labeling-label-review
    :align: center

While using this screen, you can continue to interact with the samples grid
as you normally would. The VAL system may apply additional filtering during the
review process.

.. note::

    Embeddings are a powerful way to measure the similarity of samples. Try
    using the :ref:`embeddings visualizer <brain-embeddings-visualization>`
    to quickly find clusters of similar samples to aid in your review process!

.. _verified-auto-labeling-review-tab:

Review tab
^^^^^^^^^^^

The review tab displays labels which have been generated, but not yet
promoted for approval. In this view, you can use all of the standard app
functionality to filter and analyze the labels produced by auto-labeling.
Beyond the common app features, the VAL panel provides additional controls to
assist in your review.

.. _verified-auto-labeling-confidence-threshold:

Confidence threshold
""""""""""""""""""""

Each generated label includes a confidence score as produced by the underlying
model during inference. The VAL panel provides a slider (as well as numeric
inputs) which allow you to filter labels by setting a minimum and maximum
confidence threshold.

.. image:: /images/enterprise/val_confidence_threshold.png
    :alt: verified-auto-labeling-confidence-threshold
    :align: center

.. note::

    Setting the minimum or maximum confidence in the VAL panel is equivalent
    to setting the same confidence thresholds using the sidebar filters.

Filtering by model confidence provides a simple mechanism for identifying
high-quality labels in bulk.

.. _verified-auto-labeling-analysis-table:

Label analysis table
""""""""""""""""""""

The VAL panel includes a table which lists aggregate statistics for each label
class.

.. image:: /images/enterprise/val_label_review_table.png
    :alt: verified-auto-labeling-label-review-table
    :align: center

**Label** - the name of the label class.

**Instances** - the number of instances of this label class in the current
view.

**Confidence** - the mean confidence of the class instances in the current
view.

Clicking on a row in the label analysis table will filter the current view to
contain only labels of the specified class. Clicking the selected row again
will remove this filter and show all classes.

.. note::

    If the current view contains a subset of the labels, the **Instances**
    column will read **#current of #total**. If you have specific samples
    selected, **#current** will reflect the labels contained within your
    selection.

    For example, if the **Instances** column reads **21 of 100**, this means
    that there are 21 instances of the class in the current view, and 100 total
    instances in the set of unpromoted labels. Labels which have already been
    promoted (visible in the
    :ref:`approval tab <verified-auto-labeling-approval-tab>`) are excluded
    from these counts.

.. _verified-auto-labeling-promoting-labels:

Promoting labels for approval
"""""""""""""""""""""""""""""

As you explore the generated labels and identify high-quality instances, you
can promote labels for approval by clicking the **Add # labels for approval**
button at the bottom of the VAL panel. This will designate the labels as ready
for approval, and they will be removed from the review tab. Once they have
been promoted, you can continue to select and promote additional labels in the
same manner.

.. image:: /images/enterprise/val_partial_approval.png
    :alt: verified-auto-labeling-label-review-partial-approval
    :align: center

To view and manage promoted labels, navigate to the
:ref:`approval tab <verified-auto-labeling-approval-tab>`.

.. note::

    Promoting labels for approval can always be undone from the
    :ref:`approval tab <verified-auto-labeling-approval-tab>`.

.. _verified-auto-labeling-approval-tab:

Approval tab
^^^^^^^^^^^^

The approval tab displays all of the labels which have been promoted for
approval. This tab offers three primary capabilities:

**Undo all** - clicking this button will return all promoted labels back to
the review tab. This is the simplest way to "reset" the review process.

**Undo (row-level)** - clicking the undo button for a specific class will
return all promoted labels **for that class** back to the review tab.

**Approve # labels** - clicking this button is a terminal operation for the
auto-labeling experience. The following actions will occur:

1. All labels which have not been promoted will be deleted.
2. All labels which have been promoted will be added to the sample.
3. The Verified Auto-Labeling run will transition to the **Approved** status.

.. image:: /images/enterprise/val_label_approval.png
    :alt: verified-auto-labeling-label-approval
    :align: center

.. warning::

    Clicking the **Approve # labels** will effectively "close" the
    auto-labeling run. This action cannot be undone, and further label review
    will require a new auto-labeling run. Ensure that your review process is
    complete before taking this action.

.. note::

    Prior to clicking **Approve # labels**, you can return to the label review
    process at any time by clicking on the
    :ref:`Review <verified-auto-labeling-review-tab>` tab.

.. _verified-auto-labeling-infrastructure:

Infrastructure Guidance
_______________________

Verified Auto-Labeling makes use of state-of-the-art models, which are
optimized to run with GPU resources available. While the provided models can
run without GPUs, **it is strongly recommended to provide GPU
resources** for the best experience. CPU-based workloads can be used for
testing auto-labeling on a small number of samples.

Due to the compute requirements for model inference, Verified Auto-Labeling is
expected to run as a
:ref:`delegated operation <delegated-operations>` on a configured
:ref:`orchestrator <enterprise-delegated-orchestrator>`. The guidance in
this section is targeted towards your orchestrator.

.. _verified-auto-labeling-infra-recommendations:

Infrastructure recommendations
------------------------------

This section provides a summary of the recommendations in the following
sections. For more information on these values, review the sections below.

=======================  =================
Category                 Recommended value
=======================  =================
CPU                      4 vCPU
GPU                      1 GPU
Memory                   4 GB
Shared memory (``shm``)  1 GB
Storage (model zoo dir)  64 GB
=======================  =================

.. note::

    These recommendations are for getting started with Verified Auto-Labeling.
    If you have access to high-performance compute resources, increasing CPU,
    memory, and shared-memory configuration will generally yield improved
    model throughput.

.. _verified-auto-labeling-infra-cpu-memory:

CPU and memory
--------------

In the context of Verified Auto-Labeling, CPU and memory primarily facilitate
fetching and loading sample data, inference pre-processing, and inference
post-processing. The specific requirements will depend on the size and nature
of your samples, but a moderate configuration with 2-4 vCPU and 4-8 GB of
memory will be sufficient for many use cases. Increasing these values will
improve pre- and post-processing overhead, but the majority of compute time
is expected to be consumed by model inference itself, which should be executed
on a GPU. See :ref:`GPU resources <verified-auto-labeling-infra-gpu>` for more
information.

.. _verified-auto-labeling-infra-shared-memory:

Shared memory
^^^^^^^^^^^^^

In order for model inference to run efficiently, the underlying libraries
leverage concurrent processes to perform work in parallel. These processes
communicate through the use of shared memory (``shm``). If there is
insufficient shared memory configured, you may encounter runtime errors. We
recommend configuring ``shm`` to at least 1 GB for nominal datasets. You may
need to adjust this value based on the nature of your data and your compute
capabilities.

.. _verified-auto-labeling-infra-gpu:

GPU resources
-------------

Modern models are designed to run with GPU compute available. While most models
are compatible with CPU-only workloads, performance will degrade significantly,
and CPU and memory requirements will be much higher. To use Verified
Auto-Labeling effectively, we strongly recommend allocating GPU resources to
facilitate model inference.

.. _verified-auto-labeling-infra-storage:

Storage
-------

In order for models to run, the model must first be downloaded to an accessible
filesystem. Verified Auto-Labeling makes use of the FiftyOne model zoo
directory for model storage. See FiftyOne's
:ref:`configuration options <configuring-fiftyone>` for more information.

Models will be downloaded as needed, and will be reused if already present in
the model zoo directory. The exact storage requirements will depend on the
number and size of the models you select for auto-labeling, but 32-64GB of
storage is sufficient to store all of the models available for auto-labeling.

.. note::

    The model zoo directory is shared across FiftyOne. If you are already using
    models from the FiftyOne model zoo in other workflows, this may increase
    the storage requirements for the model zoo directory. Consult with your
    system administrator to determine whether there is sufficient storage.

.. _verified-auto-labeling-faq:

FAQ
___

**Can I use my own model to generate labels?**

Not yet. We currently offer a selection of models which are well-suited to
auto-labeling. See
:ref:`model reference <verified-auto-labeling-model-reference>`
for more information.

.. _verified-auto-labeling-troubleshooting:

Troubleshooting errors
______________________

**I see errors in my run relating to dataloaders,**
**or processes exiting abnormally.**

This is most often related to shared memory (``shm``) configuration. See our
:ref:`infrastructure guidance <verified-auto-labeling-infrastructure>`
for more information.

.. _verified-auto-labeling-model-reference:

Model reference
_______________

Verified Auto-Labeling supports a subset of models sourced from the
:ref:`FiftyOne model zoo <model-zoo>`. These models have been selected for
their strong performance in auto-labeling.

.. _verified-auto-labeling-classification-models:

Classification models
---------------------

  - `clip-vit-base32-torch <https://docs.voxel51.com/model_zoo/models/clip_vit_base32_torch.html>`_
  - `open-clip-torch <https://docs.voxel51.com/model_zoo/models/open_clip_torch.html>`_
  - `resnet101-imagenet-torch <https://docs.voxel51.com/model_zoo/models/resnet101_imagenet_torch.html>`_
  - `resnet152-imagenet-torch <https://docs.voxel51.com/model_zoo/models/resnet152_imagenet_torch.html>`_
  - `resnet18-imagenet-torch <https://docs.voxel51.com/model_zoo/models/resnet18_imagenet_torch.html>`_
  - `resnet34-imagenet-torch <https://docs.voxel51.com/model_zoo/models/resnet34_imagenet_torch.html>`_
  - `resnet50-imagenet-torch <https://docs.voxel51.com/model_zoo/models/resnet50_imagenet_torch.html>`_
  - `siglip-base-patch16-224-torch <https://docs.voxel51.com/model_zoo/models/siglip_base_patch16_224_torch.html>`_
  - `vit-base-patch16-224-imagenet-torch <https://docs.voxel51.com/model_zoo/models/vit_base_patch16_224_imagenet_torch.html>`_

.. _verified-auto-labeling-detection-models:

Detection models
----------------

  - `faster-rcnn-resnet50-fpn-coco-torch <https://docs.voxel51.com/model_zoo/models/faster_rcnn_resnet50_fpn_coco_torch.html>`_
  - `omdet-turbo-swin-tiny-torch <https://docs.voxel51.com/model_zoo/models/omdet_turbo_swin_tiny_torch.html>`_
  - `owlvit-base-patch16-torch <https://docs.voxel51.com/model_zoo/models/owlvit_base_patch16_torch.html>`_
  - `yolo11l-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11l_coco_torch.html>`_
  - `yolo11m-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11m_coco_torch.html>`_
  - `yolo11n-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11n_coco_torch.html>`_
  - `yolo11s-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11s_coco_torch.html>`_
  - `yolo11x-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11x_coco_torch.html>`_
  - `yolov10l-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov10l_coco_torch.html>`_
  - `yolov10m-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov10m_coco_torch.html>`_
  - `yolov10n-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov10n_coco_torch.html>`_
  - `yolov10s-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov10s_coco_torch.html>`_
  - `yolov10x-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov10x_coco_torch.html>`_
  - `yolov8l-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8l_coco_torch.html>`_
  - `yolov8l-oiv7-torch <https://docs.voxel51.com/model_zoo/models/yolov8l_oiv7_torch.html>`_
  - `yolov8l-world-torch <https://docs.voxel51.com/model_zoo/models/yolov8l_world_torch.html>`_
  - `yolov8m-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8m_coco_torch.html>`_
  - `yolov8m-oiv7-torch <https://docs.voxel51.com/model_zoo/models/yolov8m_oiv7_torch.html>`_
  - `yolov8m-world-torch <https://docs.voxel51.com/model_zoo/models/yolov8m_world_torch.html>`_
  - `yolov8n-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8n_coco_torch.html>`_
  - `yolov8n-oiv7-torch <https://docs.voxel51.com/model_zoo/models/yolov8n_oiv7_torch.html>`_
  - `yolov8s-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8s_coco_torch.html>`_
  - `yolov8s-oiv7-torch <https://docs.voxel51.com/model_zoo/models/yolov8s_oiv7_torch.html>`_
  - `yolov8s-world-torch <https://docs.voxel51.com/model_zoo/models/yolov8s_world_torch.html>`_
  - `yolov8x-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8x_coco_torch.html>`_
  - `yolov8x-oiv7-torch <https://docs.voxel51.com/model_zoo/models/yolov8x_oiv7_torch.html>`_
  - `yolov8x-world-torch <https://docs.voxel51.com/model_zoo/models/yolov8x_world_torch.html>`_
  - `yolov9c-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov9c_coco_torch.html>`_
  - `yolov9e-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov9e_coco_torch.html>`_

.. _verified-auto-labeling-segmentation-models:

Segmentation models
-------------------

  - `deeplabv3-resnet101-coco-torch <https://docs.voxel51.com/model_zoo/models/deeplabv3_resnet101_coco_torch.html>`_
  - `deeplabv3-resnet50-coco-torch <https://docs.voxel51.com/model_zoo/models/deeplabv3_resnet50_coco_torch.html>`_
  - `fcn-resnet101-coco-torch <https://docs.voxel51.com/model_zoo/models/fcn_resnet101_coco_torch.html>`_
  - `fcn-resnet50-coco-torch <https://docs.voxel51.com/model_zoo/models/fcn_resnet50_coco_torch.html>`_
  - `group-vit-segmentation-transformer-torch <https://docs.voxel51.com/model_zoo/models/group_vit_segmentation_transformer_torch.html>`_
  - `segment-anything-2-hiera-base-plus-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2_hiera_base_plus_image_torch.html>`_
  - `segment-anything-2-hiera-large-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2_hiera_large_image_torch.html>`_
  - `segment-anything-2-hiera-small-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2_hiera_small_image_torch.html>`_
  - `segment-anything-2-hiera-tiny-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2_hiera_tiny_image_torch.html>`_
  - `segment-anything-2.1-hiera-base-plus-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2.1_hiera_base_plus_image_torch.html>`_
  - `segment-anything-2.1-hiera-large-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2.1_hiera_large_image_torch.html>`_
  - `segment-anything-2.1-hiera-small-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2.1_hiera_small_image_torch.html>`_
  - `segment-anything-2.1-hiera-tiny-image-torch <https://docs.voxel51.com/model_zoo/models/segment_anything_2.1_hiera_tiny_image_torch.html>`_
  - `yolo11l-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11l_seg_coco_torch.html>`_
  - `yolo11m-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11m_seg_coco_torch.html>`_
  - `yolo11n-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11n_seg_coco_torch.html>`_
  - `yolo11s-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11s_seg_coco_torch.html>`_
  - `yolo11x-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolo11x_seg_coco_torch.html>`_
  - `yoloe11l-seg-torch <https://docs.voxel51.com/model_zoo/models/yoloe11l_seg_torch.html>`_
  - `yoloe11m-seg-torch <https://docs.voxel51.com/model_zoo/models/yoloe11m_seg_torch.html>`_
  - `yoloe11s-seg-torch <https://docs.voxel51.com/model_zoo/models/yoloe11s_seg_torch.html>`_
  - `yoloev8l-seg-torch <https://docs.voxel51.com/model_zoo/models/yoloev8l_seg_torch.html>`_
  - `yoloev8m-seg-torch <https://docs.voxel51.com/model_zoo/models/yoloev8m_seg_torch.html>`_
  - `yoloev8s-seg-torch <https://docs.voxel51.com/model_zoo/models/yoloev8s_seg_torch.html>`_
  - `yolov8l-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8l_seg_coco_torch.html>`_
  - `yolov8m-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8m_seg_coco_torch.html>`_
  - `yolov8n-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8n_seg_coco_torch.html>`_
  - `yolov8s-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8s_seg_coco_torch.html>`_
  - `yolov8x-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov8x_seg_coco_torch.html>`_
  - `yolov9c-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov9c_seg_coco_torch.html>`_
  - `yolov9e-seg-coco-torch <https://docs.voxel51.com/model_zoo/models/yolov9e_seg_coco_torch.html>`_
