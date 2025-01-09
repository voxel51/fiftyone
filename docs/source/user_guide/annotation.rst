.. _fiftyone-annotation:

Annotating Datasets
===================

.. default-role:: code

FiftyOne provides a powerful annotation API that makes it easy to add or edit
labels on your :ref:`datasets <using-datasets>` or specific
:ref:`views <using-views>` into them.

.. note::

    Did you know? You can request, manage, and import annotations from within
    the FiftyOne App by installing the
    `@voxel51/annotation <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/annotation>`_
    plugin!

.. note::

    Check out :doc:`this tutorial </tutorials/cvat_annotation>` to see an
    example workflow that uses the annotation API to create, delete, and fix
    annotations on a FiftyOne dataset.

.. _annotation-basic-recipe:

Basic recipe
____________

The basic workflow to use the annotation API to add or edit labels on your
FiftyOne datasets is as follows:

1) Load a :ref:`labeled or unlabeled dataset <loading-datasets>` into FiftyOne

2) Explore the dataset using the :ref:`App <fiftyone-app>` or
   :ref:`dataset views <using-views>` to locate either unlabeled samples that
   you wish to annotate or labeled samples whose annotations you want to edit

3) Use the
   :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
   method on your dataset or view to upload the samples and optionally their
   existing labels to the annotation backend

4) In the annotation tool, perform the necessary annotation work

5) Back in FiftyOne, load your dataset and use the
   :meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
   method to merge the annotations back into your FiftyOne dataset

6) If desired, delete the annotation tasks and the record of the annotation run
   from your FiftyOne dataset

|br|
The example below demonstrates this workflow using the default
:ref:`CVAT backend <cvat-integration>`.

.. note::

    You must create an account at `app.cvat.ai <https://app.cvat.ai>`_ in order to
    run this example.

    Note that you can store your credentials as described in
    :ref:`this section <cvat-setup>` to avoid entering them manually each time
    you interact with CVAT.

First, we create the annotation tasks:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    # Step 1: Load your data into FiftyOne

    dataset = foz.load_zoo_dataset(
        "quickstart", dataset_name="cvat-annotation-example"
    )
    dataset.persistent = True

    dataset.evaluate_detections(
        "predictions", gt_field="ground_truth", eval_key="eval"
    )

    # Step 2: Locate a subset of your data requiring annotation

    # Create a view that contains only high confidence false positive model
    # predictions, with samples containing the most false positives first
    most_fp_view = (
        dataset
        .filter_labels("predictions", (F("confidence") > 0.8) & (F("eval") == "fp"))
        .sort_by(F("predictions.detections").length(), reverse=True)
    )

    # Let's edit the ground truth annotations for the sample with the most
    # high confidence false positives
    sample_id = most_fp_view.first().id
    view = dataset.select(sample_id)

    # Step 3: Send samples to CVAT

    # A unique identifier for this run
    anno_key = "cvat_basic_recipe"

    view.annotate(
        anno_key,
        label_field="ground_truth",
        attributes=["iscrowd"],
        launch_editor=True,
    )
    print(dataset.get_annotation_info(anno_key))

    # Step 4: Perform annotation in CVAT and save the tasks

Then, once the annotation work is complete, we merge the annotations back into
FiftyOne:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    anno_key = "cvat_basic_recipe"

    # Step 5: Merge annotations back into FiftyOne dataset

    dataset = fo.load_dataset("cvat-annotation-example")
    dataset.load_annotations(anno_key)

    # Load the view that was annotated in the App
    view = dataset.load_annotation_view(anno_key)
    session = fo.launch_app(view=view)

    # Step 6: Cleanup

    # Delete tasks from CVAT
    results = dataset.load_annotation_results(anno_key)
    results.cleanup()

    # Delete run record (not the labels) from FiftyOne
    dataset.delete_annotation_run(anno_key)

.. note::

    Check out :ref:`this page <cvat-examples>` to see a variety of common
    annotation patterns using the CVAT backend to illustrate the full process.

.. _annotation-setup:

Setup
_____

By default, all annotation is performed via `app.cvat.ai <https://app.cvat.ai>`_,
which simply requires that you create an account and then configure your
username and password credentials.

However, you can configure FiftyOne to use a
:ref:`self-hosted CVAT server <cvat-self-hosted-server>`, or you can even use a
completely :ref:`custom backend <custom-annotation-backend>`.

.. note::

    See :ref:`this page <cvat-setup>` for CVAT-specific setup instructions.

Changing your annotation backend
--------------------------------

You can use a specific backend for a particular annotation run by passing the
`backend` parameter to
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`:

.. code:: python
    :linenos:

    view.annotate(..., backend="<backend>", ...)

Alternatively, you can change your default annotation backend for an entire
session by setting the `FIFTYONE_ANNOTATION_DEFAULT_BACKEND` environment
variable.

.. code-block:: shell

    export FIFTYONE_ANNOTATION_DEFAULT_BACKEND=<backend>

Finally, you can permanently change your default annotation backend by updating
the `default_backend` key of your :ref:`annotation config <annotation-config>`
at `~/.fiftyone/annotation_config.json`:

.. code-block:: text

    {
        "default_backend": "<backend>",
        "backends": {
            "<backend>": {...},
            ...
        }
    }

.. _configuring-your-backend:

Configuring your backend
------------------------

Annotation backends may be configured in a variety of backend-specific ways,
which you can see by inspecting the parameters of a backend's associated
|AnnotationBackendConfig| class.

The relevant classes for the builtin annotation backends are:

-   `"cvat"`: :class:`fiftyone.utils.cvat.CVATBackendConfig`
-   `"labelstudio"`: :class:`fiftyone.utils.labelstudio.LabelStudioBackendConfig`
-   `"labelbox"`: :class:`fiftyone.utils.labelbox.LabelboxBackendConfig`

You can configure an annotation backend's parameters for a specific run by
simply passing supported config parameters as keyword arguments each time you call
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`:

.. code:: python
    :linenos:

    view.annotate(
        ...
        backend="cvat",
        url="http://localhost:8080",
        username=...,
        password=...,
    )

Alternatively, you can more permanently configure your backend(s) via your
:ref:`annotation config <annotation-config>`.

.. _annotation-config:

Annotation config
_________________

FiftyOne provides an annotation config that you can use to either temporarily
or permanently configure the behavior of the annotation API.

Viewing your config
-------------------

You can print your current annotation config at any time via the Python library
and the CLI:

.. tabs::

  .. tab:: Python

    .. code-block:: python

        import fiftyone as fo

        # Print your current annotation config
        print(fo.annotation_config)

    .. code-block:: text

        {
            "default_backend": "cvat",
            "backends": {
                "cvat": {
                    "config_cls": "fiftyone.utils.cvat.CVATBackendConfig",
                    "url": "https://app.cvat.ai"
                }
            }
        }

  .. tab:: CLI

    .. code-block:: shell

        # Print your current annotation config
        fiftyone annotation config

    .. code-block:: text

        {
            "default_backend": "cvat",
            "backends": {
                "cvat": {
                    "config_cls": "fiftyone.utils.cvat.CVATBackendConfig",
                    "url": "https://app.cvat.ai"
                }
            }
        }

.. note::

    If you have customized your annotation config via any of the methods
    described below, printing your config is a convenient way to ensure that
    the changes you made have taken effect as you expected.

Modifying your config
---------------------

You can modify your annotation config in a variety of ways. The following
sections describe these options in detail.

Order of precedence
~~~~~~~~~~~~~~~~~~~

The following order of precedence is used to assign values to your annotation
config settings as runtime:

1. Config settings applied at runtime by directly editing
   `fiftyone.annotation_config`
2. `FIFTYONE_XXX` environment variables
3. Settings in your JSON config (`~/.fiftyone/annotation_config.json`)
4. The default config values

Editing your JSON config
~~~~~~~~~~~~~~~~~~~~~~~~

You can permanently customize your annotation config by creating a
`~/.fiftyone/annotation_config.json` file on your machine. The JSON file may
contain any desired subset of config fields that you wish to customize.

For example, the following config JSON file customizes the URL of your CVAT
server without changing any other default config settings:

.. code-block:: json

    {
        "backends": {
            "cvat": {
                "url": "http://localhost:8080"
            }
        }
    }

When `fiftyone` is imported, any options from your JSON config are merged into
the default config, as per the order of precedence described above.

.. note::

    You can customize the location from which your JSON config is read by
    setting the `FIFTYONE_ANNOTATION_CONFIG_PATH` environment variable.

Setting environment variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Annotation config settings may be customized on a per-session basis by setting
the `FIFTYONE_XXX` environment variable(s) for the desired config settings.

The `FIFTYONE_ANNOTATION_DEFAULT_BACKEND` environment variable allows you to
configure your default backend:

.. code-block:: shell

    export FIFTYONE_ANNOTATION_DEFAULT_BACKEND=labelbox

You can declare parameters for specific annotation backends by setting
environment variables of the form `FIFTYONE_<BACKEND>_<PARAMETER>`. Any
settings that you declare in this way will be passed as keyword arguments to
methods like
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
whenever the corresponding backend is in use. For example, you can configure
the URL, username, password, and email (if applicable) of your CVAT server as
follows:

.. code-block:: shell

    export FIFTYONE_CVAT_URL=http://localhost:8080
    export FIFTYONE_CVAT_USERNAME=...
    export FIFTYONE_CVAT_PASSWORD=...
    export FIFTYONE_CVAT_EMAIL=...  # if applicable

The `FIFTYONE_ANNOTATION_BACKENDS` environment variable can be set to a
`list,of,backends` that you want to expose in your session, which may exclude
native backends and/or declare additional custom backends whose parameters are
defined via additional config modifications of any kind:

.. code-block:: shell

    export FIFTYONE_ANNOTATION_BACKENDS=custom,cvat,labelbox

When declaring new backends, you can include `*` to append new backend(s)
without omitting or explicitly enumerating the builtin backends. For example,
you can add a `custom` annotation backend as follows:

.. code-block:: shell

    export FIFTYONE_ANNOTATION_BACKENDS=*,custom
    export FIFTYONE_CUSTOM_CONFIG_CLS=your.custom.AnnotationConfig

Modifying your config in code
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can dynamically modify your annotation config at runtime by directly
editing the `fiftyone.annotation_config` object.

Any changes to your annotation config applied via this manner will immediately
take effect in all subsequent calls to `fiftyone.annotation_config` during your
current session.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    fo.annotation_config.default_backend = "<backend>"

.. _requesting-annotations:

Requesting annotations
______________________

Use the
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` method
to send the samples and optionally existing labels in a |Dataset| or
|DatasetView| to your annotation backend for processing.

The basic syntax is:

.. code:: python
    :linenos:

    anno_key = "..."
    view.annotate(anno_key, ...)

The `anno_key` argument defines a unique identifier for the annotation run, and
you will provide it to methods like
:meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`,
:meth:`get_annotation_info() <fiftyone.core.collections.SampleCollection.load_annotations>`,
:meth:`load_annotation_results() <fiftyone.core.collections.SampleCollection.load_annotation_results>`,
:meth:`rename_annotation_run() <fiftyone.core.collections.SampleCollection.rename_annotation_run>`, and
:meth:`delete_annotation_run() <fiftyone.core.collections.SampleCollection.delete_annotation_run>`
to manage the run in the future.

.. warning::

    FiftyOne assumes that all labels in an annotation run can fit in memory.

    If you are annotating very large scale video datasets with dense frame
    labels, you may violate this assumption. Instead, consider breaking the
    work into multiple smaller annotation runs that each contain limited
    subsets of the samples you wish to annotate.

    You can use :meth:`Dataset.stats() <fiftyone.core.dataset.Dataset.stats>`
    to get a sense for the total size of the labels in a dataset as a rule of
    thumb to estimate the size of a candidate annotation run.

In addition,
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
provides various parameters that you can use to customize the annotation tasks
that you wish to be performed.

The following parameters are supported by all annotation backends:

-   **backend** (*None*): the annotation backend to use. The supported values
    are `fiftyone.annotation_config.backends.keys()` and the default is
    `fiftyone.annotation_config.default_backend`
-   **media_field** (*"filepath"*): the sample field containing the path to the
    source media to upload
-   **launch_editor** (*False*): whether to launch the annotation backend's
    editor after uploading the samples

The following parameters allow you to configure the labeling schema to use for
your annotation tasks. See :ref:`this section <annotation-label-schema>` for
more details:

-   **label_schema** (*None*): a dictionary defining the label schema to use.
    If this argument is provided, it takes precedence over the remaining fields
-   **label_field** (*None*): a string indicating a new or existing label field
    to annotate
-   **label_type** (*None*): a string indicating the type of labels to
    annotate. The possible label types are:

    -   ``"classification"``: a single classification stored in
        |Classification| fields
    -   ``"classifications"``: multilabel classifications stored in
        |Classifications| fields
    -   ``"detections"``: object detections stored in |Detections| fields
    -   ``"instances"``: instance segmentations stored in |Detections| fields
        with their :attr:`mask <fiftyone.core.labels.Detection.mask>`
        attributes populated
    -   ``"polylines"``: polylines stored in |Polylines| fields with their
        :attr:`filled <fiftyone.core.labels.Polyline.filled>` attributes set to
        `False`
    -   ``"polygons"``: polygons stored in |Polylines| fields with their
        :attr:`filled <fiftyone.core.labels.Polyline.filled>` attributes set to
        `True`
    -   ``"keypoints"``: keypoints stored in |Keypoints| fields
    -   ``"segmentation"``: semantic segmentations stored in |Segmentation|
        fields
    -   ``"scalar"``: scalar labels stored in |IntField|, |FloatField|,
        |StringField|, or |BooleanField| fields

    All new label fields must have their type specified via this argument or in
    `label_schema`
-   **classes** (*None*): a list of strings indicating the class options for
    `label_field` or all fields in `label_schema` without classes specified.
    All new label fields must have a class list provided via one of the
    supported methods. For existing label fields, if classes are not provided
    by this argument nor `label_schema`, the observed labels on your dataset
    are used
-   **attributes** (*True*): specifies the label attributes of each label field
    to include (other than their `label`, which is always included) in the
    annotation export. Can be any of the following:

    -   `True`: export all label attributes
    -   `False`: don't export any custom label attributes
    -   a list of label attributes to export
    -   a dict mapping attribute names to dicts specifying the `type`,
        `values`, and `default` for each attribute

    If a `label_schema` is also provided, this parameter determines which
    attributes are included for all fields that do not explicitly define their
    per-field attributes (in addition to any per-class attributes)
-   **mask_targets** (*None*): a dict mapping pixel values to semantic label
    strings. Only applicable when annotating semantic segmentations. All new
    label fields must have mask targets provided via one of the supported
    methods. For existing label fields, if mask targets are not provided by
    this argument nor `label_schema`, any applicable mask targets stored on
    your dataset will be used, if available
-   **allow_additions** (*True*): whether to allow new labels to be added. Only
    applicable when editing existing label fields
-   **allow_deletions** (*True*): whether to allow labels to be deleted. Only
    applicable when editing existing label fields
-   **allow_label_edits** (*True*): whether to allow the `label` attribute of
    existing labels to be modified. Only applicable when editing existing
    fields with `label` attributes
-   **allow_index_edits** (*True*): whether to allow the `index` attribute
    of existing video tracks to be modified. Only applicable when editing
    existing frame fields with `index` attributes
-   **allow_spatial_edits** (*True*): whether to allow edits to the spatial
    properties (bounding boxes, vertices, keypoints, masks, etc) of labels.
    Only applicable when editing existing spatial label fields

|br|
In addition, each annotation backend can typically be configured in a variety
of backend-specific ways. See :ref:`this section <configuring-your-backend>`
for more details.

.. note::

    Specific annotation backends may not support all ``label_type`` options.

.. _annotation-label-schema:

Label schema
------------

The `label_schema`, `label_field`, `label_type`, `classes`, `attributes`, and
`mask_targets` parameters to
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` allow
you to define the annotation schema that you wish to be used.

The label schema may define new label field(s) that you wish to populate, and
it may also include existing label field(s), in which case you can add, delete,
or edit the existing labels on your FiftyOne dataset.

The `label_schema` argument is the most flexible way to define how to construct
tasks in CVAT. In its most verbose form, it is a dictionary that defines the
label type, annotation type, possible classes, and possible attributes for each
label field:

.. code:: python
    :linenos:

    anno_key = "..."

    label_schema = {
        "new_field": {
            "type": "classifications",
            "classes": ["class1", "class2"],
            "attributes": {
                "attr1": {
                    "type": "select",
                    "values": ["val1", "val2"],
                    "default": "val1",
                },
                "attr2": {
                    "type": "radio",
                    "values": [True, False],
                    "default": False,
                }
            },
        },
        "existing_field": {
            "classes": ["class3", "class4"],
            "attributes": {
                "attr3": {
                    "type": "text",
                }
            }
        },
    }

    dataset.annotate(anno_key, label_schema=label_schema)

You can also define class-specific attributes by setting elements of the
`classes` list to dicts that specify groups of `classes` and their
corresponding `attributes`. For example, in the configuration below, `attr1`
only applies to `class1` and `class2` while `attr2` applies to all classes:

.. code:: python
    :linenos:

    anno_key = "..."

    label_schema = {
        "new_field": {
            "type": "detections",
            "classes": [
                {
                    "classes": ["class1", "class2"],
                    "attributes": {
                        "attr1": {
                            "type": "select",
                            "values": ["val1", "val2"],
                            "default": "val1",
                        }
                     }
                },
                "class3",
                "class4",
            ],
            "attributes": {
                "attr2": {
                    "type": "radio",
                    "values": [True, False],
                    "default": False,
                }
            },
        },
    }

    dataset.annotate(anno_key, label_schema=label_schema)

Alternatively, if you are only editing or creating a single label field, you
can use the `label_field`, `label_type`, `classes`, `attributes`, and
`mask_targets` parameters to specify the components of the label schema
individually:

.. code:: python
    :linenos:

    anno_key = "..."

    label_field = "new_field",
    label_type = "classifications"
    classes = ["class1", "class2"]

    # These are optional
    attributes = {
        "attr1": {
            "type": "select",
            "values": ["val1", "val2"],
            "default": "val1",
        },
        "attr2": {
            "type": "radio",
            "values": [True, False],
            "default": False,
        }
    }

    dataset.annotate(
        anno_key,
        label_field=label_field,
        label_type=label_type,
        classes=classes,
        attributes=attributes,
    )

When you are annotating existing label fields, you can omit some of these
parameters from
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`, as
FiftyOne can infer the appropriate values to use:

-   **label_type**: if omitted, the |Label| type of the field will be used to
    infer the appropriate value for this parameter
-   **classes**: if omitted, the observed labels on your dataset will be used
    to construct a classes list
-   **mask_targets**: if omitted for a semantic segmentation field, the mask
    targets from the
    :meth:`mask_targets <fiftyone.core.dataset.Dataset.mask_targets>` or
    :meth:`default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
    properties of your dataset will be used, if available

.. _annotation-label-attributes:

Label attributes
----------------

The `attributes` parameter allows you to configure whether
:ref:`custom attributes <using-labels>` beyond the default `label` attribute
are included in the annotation tasks.

When adding new label fields for which you want to include attributes, you must
use the dictionary syntax demonstrated below to define the schema of each
attribute that you wish to label:

.. code:: python
    :linenos:

    anno_key = "..."

    attributes = {
        "occluded": {
            "type": "radio",
            "values": [True, False],
            "default": False,
        },
        "gender": {
            "type": "select",
            "values": ["male", "female"],
        },
        "caption": {
            "type": "text",
        }
    }

    view.annotate(
        anno_key,
        label_field="new_field",
        label_type="detections",
        classes=["dog", "cat", "person"],
        attributes=attributes,
    )

You can always omit this parameter if you do not require attributes beyond the
default `label`.

Each annotation backend may support different `type` values, as declared by the
:meth:`supported_attr_types() <fiftyone.utils.annotations.AnnotationBackend.supported_attr_types>`
method of its |AnnotationBackend| class. For example, CVAT supports the
following choices for `type`:

-   `text`: a free-form text box. In this case, `default` is optional and
    `values` is unused
-   `select`: a selection dropdown. In this case, `values` is required and
    `default` is optional
-   `radio`: a radio button list UI. In this case, `values` is required and
    `default` is optional
-   `checkbox`: a boolean checkbox UI. In this case, `default` is optional and
    `values` is unused

When you are annotating existing label fields, the `attributes` parameter can
take additional values:

-   `True` (default): export all custom attributes observed on the existing
    labels, using their observed values to determine the appropriate UI type
    and possible values, if applicable
-   `False`: do not include any custom attributes in the export
-   a list of custom attributes to include in the export
-   a full dictionary syntax described above

Note that only scalar-valued label attributes are supported. Other attribute
types like lists, dictionaries, and arrays will be omitted.

.. _annotation-restricting-edits:

Restricting additions, deletions, and edits
-------------------------------------------

When you create annotation runs that involve editing existing label fields, you
can optionally specify that certain changes are not allowed by passing the
following flags to
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`:

-   **allow_additions** (*True*): whether to allow new labels to be added
-   **allow_deletions** (*True*): whether to allow labels to be deleted
-   **allow_label_edits** (*True*): whether to allow the `label` attribute to
    be modified
-   **allow_index_edits** (*True*): whether to allow the `index` attribute of
    video tracks to be modified
-   **allow_spatial_edits** (*True*): whether to allow edits to the spatial
    properties (bounding boxes, vertices, keypoints, etc) of labels

If you are using the `label_schema` parameter to provide a full annotation
schema to
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`, you
can also directly include the above flags in the configuration dicts for any
existing label field(s) you wish.

For example, suppose you have an existing `ground_truth` field that contains
objects of various types and you would like to add new `sex` and `age`
attributes to all people in this field while also strictly enforcing that no
objects can be added, deleted, or have their labels or bounding boxes modified.
You can configure an annotation run for this as follows:

.. code:: python
    :linenos:

    anno_key = "..."

    attributes = {
        "sex": {
            "type": "select",
            "values": ["male", "female"],
        },
        "age": {
            "type": "text",
        },
    }

    view.annotate(
        anno_key,
        label_field="ground_truth",
        classes=["person"],
        attributes=attributes,
        allow_additions=False,
        allow_deletions=False,
        allow_label_edits=False,
        allow_spatial_edits=False,
    )

You can also include a `read_only=True` parameter when uploading existing
label attributes to specify that the attribute's value should be uploaded to
the annotation backend for informational purposes, but any edits to the
attribute's value should not be imported back into FiftyOne.

For example, if you have vehicles with their `make` attribute populated and you
want to populate a new `model` attribute based on this information without
allowing changes to the vehicle's `make`, you can configure an annotation run
for this as follows:

.. code:: python
    :linenos:

    anno_key = "..."

    attributes = {
        "make": {
            "type": "text",
            "read_only": True,
        },
        "model": {
            "type": "text",
        },
    }

    view.annotate(
        anno_key,
        label_field="ground_truth",
        classes=["vehicle"],
        attributes=attributes,
    )

.. note::

    Some annotation backends may not support restrictions to additions,
    deletions, spatial edits, and read-only attributes in their editing
    interface.

    However, any restrictions that you specify via the above parameters will
    still be enforced when you call
    :meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
    to merge the annotations back into FiftyOne.

.. _annotation-labeling-videos:

Labeling videos
---------------

When annotating spatiotemporal objects in videos, you have a few additional
options at your fingertips.

First, each object attribute specification can include a `mutable` property
that controls whether the attribute's value can change between frames for each
object:

.. code:: python
    :linenos:

    anno_key = "..."

    attributes = {
        "type": {
            "type": "select",
            "values": ["sedan", "suv", "truck"],
            "mutable": False,
        },
        "occluded": {
            "type": "radio",
            "values": [True, False],
            "default": False,
            "mutable": True,
        },
    }

    view.annotate(
        anno_key,
        label_field="frames.new_field",
        label_type="detections",
        classes=["vehicle"],
        attributes=attributes,
    )

The meaning of the `mutable` attribute is defined as follows:

-   `True` (default): the attribute is dynamic and can have a different value
    for every frame in which the object track appears
-   `False`: the attribute is static and is the same for every frame in which
    the object track appears

In addition, if you are using an annotation backend
:ref:`like CVAT <cvat-annotating-videos>` that supports keyframes, then when
you :ref:`download annotation runs <loading-annotations>` that include track
annotations, the downloaded label corresponding to each keyframe of an object
track will have its `keyframe=True` attribute set to denote that it was a
keyframe.

Similarly, when you create an annotation run on a video dataset that involves
*editing* existing video tracks, if at least one existing label has a
`keyframe=True` attribute set, then the available keyframe information will be
uploaded to the annotation backend.

.. _loading-annotations:

Loading annotations
___________________

After your annotations tasks in the annotation backend are complete, you can
use the
:meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
method to download them and merge them back into your FiftyOne dataset.

.. code:: python
    :linenos:

    view.load_annotations(anno_key)

The `anno_key` parameter is the unique identifier for the annotation run that
you provided when calling
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`. You
can use
:meth:`list_annotation_runs() <fiftyone.core.collections.SampleCollection.list_annotation_runs>`
to see the available keys on a dataset.

.. note::

    By default, calling
    :meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
    will not delete any information for the run from the annotation backend.

    However, you can pass `cleanup=True` to delete all information associated
    with the run from the backend after the annotations are downloaded.

You can use the optional `dest_field` parameter to override the task's
label schema and instead load annotations into different field name(s) of your
dataset. This can be useful, for example, when editing existing annotations, if
you would like to do a before/after comparison of the edits that you import. If
the annotation run involves multiple fields, `dest_field` should be a
dictionary mapping label schema field names to destination field names.

Some annotation backends like CVAT cannot explicitly prevent annotators from
creating labels that don't obey the run's label schema. You can pass the
optional `unexpected` parameter to
:meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
to configure how to deal with any such unexpected labels that are found. The
supported values are:

-   `"prompt"` (**default**): present an interactive prompt to direct/discard
    unexpected labels
-   ``"keep"``: automatically keep all unexpected labels in a field whose name
    matches the the label type
-   `"ignore"`: automatically ignore any unexpected labels
-   `"return"`: return a dict containing all unexpected labels, if any

.. _managing-annotation-runs:

Managing annotation runs
________________________

FiftyOne provides a variety of methods that you can use to manage in-progress
or completed annotation runs.

For example, you can call
:meth:`list_annotation_runs() <fiftyone.core.collections.SampleCollection.list_annotation_runs>`
to see the available annotation keys on a dataset:

.. code:: python
    :linenos:

    dataset.list_annotation_runs()

Or, you can use
:meth:`get_annotation_info() <fiftyone.core.collections.SampleCollection.get_annotation_info>`
to retrieve information about the configuration of an annotation run:

.. code:: python
    :linenos:

    info = dataset.get_annotation_info(anno_key)
    print(info)

Use :meth:`load_annotation_results() <fiftyone.core.collections.SampleCollection.load_annotation_results>`
to load the :class:`AnnotationResults <fiftyone.utils.annotations.AnnotationResults>`
instance for an annotation run.

All results objects provide a :class:`cleanup() <fiftyone.utils.annotations.AnnotationResults.cleanup>`
method that you can use to delete all information associated with a run from
the annotation backend.

.. code:: python
    :linenos:

    results = dataset.load_annotation_results(anno_key)
    results.cleanup()

In addition, the
:class:`AnnotationResults <fiftyone.utils.annotations.AnnotationResults>`
subclasses for each backend may provide additional utilities such as support
for programmatically monitoring the status of the annotation tasks in the run.

You can use
:meth:`rename_annotation_run() <fiftyone.core.collections.SampleCollection.rename_annotation_run>`
to rename the annotation key associated with an existing annotation run:

.. code:: python
    :linenos:

    dataset.rename_annotation_run(anno_key, new_anno_key)

Finally, you can use
:meth:`delete_annotation_run() <fiftyone.core.collections.SampleCollection.delete_annotation_run>`
to delete the record of an annotation run from your FiftyOne dataset:

.. code:: python
    :linenos:

    dataset.delete_annotation_run(anno_key)

.. note::

    Calling
    :meth:`delete_annotation_run() <fiftyone.core.collections.SampleCollection.delete_annotation_run>`
    only deletes the **record** of the annotation run from your FiftyOne
    dataset; it will not delete any annotations loaded onto your dataset via
    :meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`,
    nor will it delete any associated information from the annotation backend.

.. _custom-annotation-backend:

Custom annotation backends
__________________________

If you would like to use an annotation tool that is not natively supported by
FiftyOne, you can follow the instructions below to implement an interface for
your tool and then configure your environment so that the
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` and
:meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
methods will use your custom backend.

Annotation backends are defined by writing subclasses of the following
three classes with the appropriate abstract methods implemented:

-   |AnnotationBackend|: this class implements the logic required for your
    annotation backend to declare the types of labeling tasks that it supports,
    as well as the core
    :meth:`upload_annotations() <fiftyone.utils.annotations.AnnotationBackend.upload_annotations>`
    and
    :meth:`download_annotations() <fiftyone.utils.annotations.AnnotationBackend.download_annotations>`
    methods, which handle uploading and downloading data and labels to your
    annotation tool

-   |AnnotationBackendConfig|: this class defines the available parameters that
    users can pass as keyword arguments to
    :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` to
    customize the behavior of the annotation run

-   :class:`AnnotationResults <fiftyone.utils.annotations.AnnotationResults>`:
    this class stores any intermediate information necessary to track the
    progress of an annotation run that has been created and is now waiting for
    its results to be merged back into the FiftyOne dataset

.. note::

    Refer to the
    `fiftyone.utils.cvat <https://github.com/voxel51/fiftyone/blob/develop/fiftyone/utils/cvat.py>`_
    module for an example of how the above subclasses are implemented for the
    CVAT backend.

The recommended way to expose a custom backend is to add it to your
:ref:`annotation config <annotation-config>` at
`~/.fiftyone/annotation_config.json` as follows:

.. code-block:: text

    {
        "default_backend": "<backend>",
        "backends": {
            "<backend>": {
                "config_cls": "your.custom.AnnotationConfig",
                # custom parameters here
            }
        }
    }

In the above, `<backend>` defines the name of your custom backend, which you
can henceforward pass as the `backend` parameter to
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`, and
the `config_cls` parameter specifies the fully-qualified name of the
|AnnotationBackendConfig| subclass for your annotation backend.

With the `default_backend` parameter set to your custom backend as shown above,
calling
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` will
automatically use your backend.

Alternatively, you can manually opt to use your custom backend on a per-run
basis by passing the `backend` parameter:

.. code:: python
    :linenos:

    view.annotate(..., backend="<backend>", ...)
