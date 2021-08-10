.. _cvat:

CVAT Integration
================

.. default-role:: code

`CVAT <https://github.com/openvinotoolkit/cvat>`_ is one of the most popular open-source image and video annotation tools on
the market. We've made it easy to upload your data and labels directly from
FiftyOne to CVAT to create, delete, and modify annotations.

This integration supports the following label types for images and videos:

* :ref:`Detections <object-detection>`
* :ref:`Instance segmentations <instance-segmentation>`
* :ref:`Classifications <classification>`
* :ref:`Polygons and polylines <polylines>`
* :ref:`Keypoints <keypoints>`
* :ref:`Scalars <adding-sample-fields>`


.. note::

    Check out :doc:`this tutorial </tutorials/fixing_annotations>` to see how
    you can use FiftyOne to upload your data to CVAT to create, delete, and fix
    annotations.


.. image:: /images/integrations/cvat_example.png
   :alt: cvat-example
   :align: center


Workflow Overview
_________________

In the general workflow to use CVAT and FiftyOne follows these steps:

1) Load a :ref:`labeled or unlabeled dataset<loading-datasets>` into FiftyOne

2) Explore the |Dataset| and find samples in need to additional annotations or 
   containing annotation mistakes

3) Create a |DatasetView| containing the samples that need to be annotated

4) Call :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
   to automatically upload samples and labels to CVAT for annotation

5) Annotate tasks in CVAT and save them

6) Call
   :meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
   to reload annotations from CVAT back into FiftyOne


.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Step 2: Find a subset of data requiring annotation
    from fiftyone import ViewField as F

    results = dataset.evaluate_detections(pred_field="predictions", eval_key="eval")
    high_conf_view = dataset.filter_labels(
        "predictions", 
        (F("confidence") > 0.8) & (F("eval") == "fp"),
    )

    # Step 3: Create a view of samples to annotate
    # Select a sample for annotation for this example
    annot_view = high_conf_view.limit(1)

    # Step 4: Send samples to CVAT
    info = annot_view.annotate(label_field="ground_truth", launch_editor=True)

    # Step 5: In CVAT, annotate samples and save

    # Step 6: Load updated annotations back into FiftyOne
    annot_view.load_annotations(info, delete_tasks=True)



CVAT Overview 
-------------

`CVAT <https://github.com/openvinotoolkit/cvat>`_ is an open-source annotation software for images and videos. 
It can either be used through the hosted server at `cvat.org
<https://cvat.org>`_ or through a 
`custom installation and self-hosted server. <https://openvinotoolkit.github.io/cvat/docs/administration/basics/installation/>`_
No matter the server being used, an account will be required and the username
and password must be provided to FiftyOne.

CVAT uses three levels of abstraction for annotation workflows: projects,
tasks, and jobs. A job contains one or more images and can be assigned to a
specfic annotator or reviewer. A task defined the label schema to use for
annotation and contains multiple jobs. A project also allows for a label schema
and contains multiple tasks.

This integration provides and API to create tasks and jobs, upload data,
defined label schemas, and download annotations all through Python and
using FiftyOne. 

When uploading existing labels to CVAT, the unique label ids are uploaded as
attributes in order to keep track of which labels have been modified, added, or
deleted. Changing these label ids will result in labels being overwritten when
loaded into FiftyOne rather than being merged.


Setup
_____


Server URL
----------

Both `cvat.org <https://cvat.org>`_ and custom CVAT servers are supported. The
following attributes allow specification of the server URL that you have an
account on and to which you want to upload data:

* `url`: base url of the CVAT server (e.g. `cvat.org` or `localhost`)
* `port`: four digit port of the custom CVAT server if applicable
* `https`: boolean indicating whether the URL is `https` (`True`) or `http`
  (`False`)


The environment variables `FIFTYONE_CVAT_URL`, `FIFTYONE_CVAT_PORT`, and
`FIFTYONE_CVAT_HTTPS` can be set to avoid providing them in every 
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
call or they can be set in the `~/.fiftyone/annotation_config.json`.


The easiest way to get started is to use the default `cvat.org
<https://cvat.org>`_ server. This requires creating an account and providing
the credentials as shown in the following section. 

.. note::

    Media and annotations are currently always uploaded to the server from the
    filepaths stored in FiftyOne. 

Authentication
--------------

In order to connect to any CVAT server, you will need to login with your username
and password. This can be done in the following ways:

1) (Recommended) Storing login credentials as environment variables

2) Entering login credentials whenever :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
   is called

3) Passing the `auth` keyword argument to :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`

4) Storing login credentials in the FiftyOne config


1. Environment variables
~~~~~~~~~~~~~~~~~~~~~~~~

The recommended way to provide access to your CVAT username and password is to
store them in the `FIFTYONE_CVAT_USERNAME` and `FIFTYONE_CVAT_PASSWORD`
environment variables. These are automatically accessed by FiftyOne when calling 
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`.

.. code-block:: shell

    export FIFTYONE_CVAT_USERNAME=<MY_USERNAME>
    export FIFTYONE_CVAT_PASSWORD=<MY_PASSWORD>

.. note::

    The environment variables `FIFTYONE_CVAT_URL`, `FIFTYONE_CVAT_PORT`, and
    `FIFTYONE_CVAT_HTTPS` can also be set to avoid providing them in every 
    :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
    call.



2. Keyword argument
~~~~~~~~~~~~~~~~~~~

The `auth` keyword argument can be pass to the 
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` call 
during runtime. This argument accepts a dictionary mapping the strings 
`username` and `password` to your CVAT username and password.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    auth = {
        "username": MY_USERNAME,
        "password": MY_PASSWORD,
    }

    info = view.annotate(label_field="ground_truth", auth=auth) 

3. Command line prompt
~~~~~~~~~~~~~~~~~~~~~~

If you have not stored your CVAT login credentials, then you will be prompted
to enter your username and password through a command line prompt with every
call to :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`.

.. code:: python
    :linenos:

    info = view.annotate(label_field="ground_truth", launch_editor=True)

    
.. code-block:: text

    No config or environment variables found for authentication. Please enter CVAT login information. Set the environment variables `FIFTYONE_CVAT_USERNAME` and `FIFTYONE_CVAT_PASSWORD` to avoid this in the future.
    CVAT Username: MY_USERNAME
    CVAT Password: <hidden>MY_PASSWORD


4. FiftyOne config
~~~~~~~~~~~~~~~~~~

The annotation config located at `~/.fiftyone/annotation_config.json` can be
created or updated with the following settings:

.. code-block:: json

    {
        "cvat_username": MY_USERNAME,
        "cvat_password": MY_PASSWORD,
        "cvat_url": "localhost",
        "cvat_port": 8080,
        "cvat_https": false
    }

.. note::

    This method is generally not recommended for credentials as it stores login information on disk
    in plain text. However, this is recommended for storing URL information.


.. _cvat-annotate:

Annotate
________

The :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
method contains various keyword arguments that allow for detailed descriptions of
the label fields used and how to construct annotation tasks from a given
|SampleCollection|.


General arguments
-----------------

* `backend`: the annotation backend to use
* `label_schema`: the complete dictionary description of the label fields to upload or create and their corresponding classes and attributes
* `label_field`: the name of a single label field to upload or create
* `label_type`: if `label_field` is used to create a new field, this specifies the type of field to create (`detections`, `classifications`, `classification`, `keypoints`, `polylines`, `scalar`). Will be the default type for any new labels in `label_schema` that are not specified
* `classes`: a list of classes to upload or create when `label_field` is given. Will be the default classes for any new labels in `label_schema` that do not specify classes
* `attributes`:  list of attributes to upload or create when `label_field` is given. Can be a dictionary defining the type of annotation widget to use for the attribute (e.g. `text`, `select`, etc). Will be the default attributes for any new labels in `label_schema` that do not specify attributes
* `media_field`: (`"filepath"`) the sample field containing the file
  path to the media to upload
* `launch_editor`: whether to launch the browser to the first job of the first task once samples are uploaded


CVAT-specific arguments
-----------------------

* `url`: the base URL for the CVAT server, defaults to `cvat.org`
* `port`: the server port to which to connect
* `https`: boolen indicating whether to use `http` or `https` in the server url
* `segment_size`: maximum number of images to upload per job
* `image_quality`: quality to reduce images to prior to uploading
* `job_reviewers`: a list of usernames that job reviewers are assigned to sequentially
* `job_asignees`: a list of usernames that jobs are assigned to sequentially
* `task_assignee`: the user to assign to the generated task or tasks 



Attributes
----------

A |Label| can contain custom attributes. For example, a |Detection| can contain the
attribute "occluded". 
CVAT provides support for modification of these |Label| attributes. 

Annotating attributes is optional and by default (`attributes=True`) will load all attributes for
existing label fields. However, you can also define new attributes and how they
are annotated.

`attributes` can be a list of strings, in which case existing attributes will
be parsed and new attributes will default to string textbox inputs.

.. code:: python
    :linenos:

    # All attributes will attempt to be parsed from 
    # existing attributes in the label field, 
    # otherwise text boxes with no default values are used
    attributes = [<attr 1 string name>, <attr 2 string name>, ...]


Alternatively, a dictionary can be provided laying out the exact annotation
type as well as the values and default value for each attribute. 

For CVAT, the following attribute annotation types are supported:

* `radio`: `values` is required and `default_value` is optional
* `select`: `values` is required and `default_value` is optional
* `text`: `default_value` is optional, `values` is unused

.. code:: python
    :linenos:

    attributes = {
        "occluded": {
            "type": "radio",
            "values": [True, False],
            "default_value": True,
        },
        "weather": {
            "type": "select",
            "values": ["cloudy", "sunny", "overcast"],
        },
        "caption": {
            "type": "text",
        }
    }

    info = view.annotate(
        label_field="new_field",
        label_type="detections",
        classes=["dog", "cat", "person"],
        attributes=attributes,
    )

.. note:: 

    Only scalar attributes are supported for annotation. Other types like
    lists, dictionaries, arrays, etc. will not be uploaded.


Label schema
------------

If only one field is being created or modified, then the `label_field`,
`label_type`, `classes`, and `attributes` arguments can fully specify the label
schema, labels, and attributes to upload. 

The `label_schema` argument is the most flexible way to define how to construct
tasks in CVAT and how to upload and download labels for one or multiple fields. 
It is a dictionary that defines every field name, type, classes, and attributes.


The `label_type`, `classes`, and `attributes` arguments can be used to provide
default values when missing in the given `label_schema`.

.. code:: python
    :linenos:

    label_schema={
        "new_field": {
            "type": "classifications",
            "classes": ["class1", "class2"],
            "attributes": {
                "attr1": {
                    "type": "select",
                    "values": ["val1", "val2"],
                    "default_value": "val1",
                },
                "attr2": {
                    "type": "radio",
                    "values": [True, False],
                    "default_value": False,
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
    info = view.annotate(label_schema=label_schema)

.. _cvat-load-annotations:

Load Annotations
________________


The :class:`CVATAnnotationInfo <fiftyone.utils.cvat.CVATAnnotationInfo>` object
that is returned from 
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
contains all of the information required to reconnect to CVAT and load the
labels for samples that have been uploaded.


Calling 
:meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`
will reconnect to the CVAT server (possibly with the given `auth` keyword
argument), download the relevant information from the task and job ids stored
in the 
:class:`CVATAnnotationInfo <fiftyone.utils.cvat.CVATAnnotationInfo>`, parse the
downloaded annotations into FiftyOne |Label| objects, and merge these objects
back into the |SampleCollection|.


.. code:: python
    :linenos:

    view.load_annotations(info)


Examples
________

Modify existing label field
---------------------------

One of the primary use cases for this integration with CVAT is to fix the
annotation mistakes found in datasets through FiftyOne. When the `label_field`
argument is an existing field, then all |Label| objects from that field
and their attributes are uploaded for annotation.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    info = view.annotate(label_field="ground_truth", launch_editor=True)

    # Modify/Add/Delete bounding boxes and their attributes

    view.load_annotations(info, delete_tasks=True)

.. image:: /images/integrations/cvat_example.png
   :alt: cvat-example
   :align: center

The above code snippet will only load existing classes and attributes. The
`classes` and `attributes` arguments can be used to annotate new classes and
attributes.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    # List of existing or new classes to annotate
    classes = ["person", "dog", "cat", "helicopter"]

    # Load existing information for "iscrowd" attribute
    # Create new "attr2" attribute
    attributes = {
        "iscrowd": {},
        "attr2": {
            "type": "select",
            "values": ["val1", "val2"],
        }
    }

    info = view.annotate(
        label_field="ground_truth",
        classes=classes,
        attributes=attributes,
        launch_editor=True,
    )

    # Modify/Add/Delete bounding boxes and their attributes

    view.load_annotations(info, delete_tasks=True)

.. image:: /images/integrations/cvat_new_class.png
   :alt: cvat-new-class
   :align: center

.. note::

    When uploading existing labels to CVAT, the unique label ids are uploaded as
    attributes in order to keep track of which labels have been modified, added, or
    deleted. Changing these label ids will result in labels being overwritten when
    loaded into FiftyOne rather than being merged.


Create new label fields
-----------------------

In order to annotate a new label field, a label schema needs to be provided or
be able to be constructed from the given `label_type` and `classes`.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    info = view.annotate(
        label_field="new_classifications",
        label_type="classifications",
        classes=["dog", "cat", "person"],
        launch_editor=True,
    )

    # Create Tag annotations in CVAT

    view.load_annotations(info, delete_tasks=True)


Alternatively, the `label_schema` can be used to define the same new label
field.


.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    label_schema = {
        "new_classifications": {
            "type": "classifications",
            "classes": ["dog", "cat", "person"],
        }
    }

    info = view.annotate(label_schema=label_schema, launch_editor=True)

    # Create Tag annotations in CVAT

    view.load_annotations(info, delete_tasks=True)

.. image:: /images/integrations/cvat_tag.png
   :alt: cvat-tag
   :align: center

Annotate multiple fields
------------------------

The `label_schema` argument allows for multiple fields to be annotated at the
same time. Every field will be uploaded as a separate task since every CVAT
task only supports a single schema. Each CVAT task will be named
`FiftyOne_annotation_<LABEL-FIELD>`. 

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    label_schema = {
        "ground_truth": {},
        "new_keypoints": {
            "type": "keypoints",
            "classes": ["person", "cat", "dog", "food"],
            "attributes": {
                "occluded": {
                    "type": "select",
                    "values": [True, False],
                }
            }
        }
    }

    info = view.annotate(label_schema=label_schema, launch_editor=True)

    # Automatically open the "ground_truth" task and modify detections

    # Navigate to tasks and open the "FiftyOne_annotation_new_keypoints" task
    # to add keypoint annotations 

    view.load_annotations(info, delete_tasks=True)

.. image:: /images/integrations/cvat_multiple_fields.png
   :alt: cvat-multiple-fields
   :align: center



Unexpected annotations
----------------------

When annotating labels, the label fields and types must be provided. However,
there is always the option to use CVAT to annotate types that are different
than the expected label types.

For example, say you upload a `ground_truth` |Detections| field to CVAT. In
CVAT, you then add tags and polylines. Then when calling 
:meth:`load_annotations() <fiftyone.core.collections.SampleCollection.load_annotations>`,
These tags and polylines are found and a command line prompt appears asking for
names for these unexpected new fields.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    info = view.annotate(label_field="ground_truth", launch_editor=True)

    # Add polyline annotations in CVAT

    view.load_annotations(info, delete_tasks=True)

.. image:: /images/integrations/cvat_polyline.png
   :alt: cvat-polyline
   :align: center

.. code:: text

    Labels of type 'polylines' found when loading annotations for field 'ground_truth'.
    Please enter a name for the field in which to store these addtional annotations: new_polylines


.. code:: python
    :linenos:

    print(view)

.. code:: text

    Dataset:     quickstart
    Media type:  image
    Num samples: 1
    Tags:        ['validation']
    Sample fields:
        id:            fiftyone.core.fields.ObjectIdField
        filepath:      fiftyone.core.fields.StringField
        tags:          fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:      fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        ground_truth:  fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        uniqueness:    fiftyone.core.fields.FloatField
        predictions:   fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        new_polylines: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Polylines)
    View stages:
        1. Take(size=1, seed=None)



Assign users
------------

Lists of usernames can be provided to assign tasks, jobs, and reviewers. The
`task_assignee`, `job_reviewers`, and `job_asignees` arguments can be used to
provide a username (for `task_assignee`) or list of usernames that are sequentially assigned to created tasks and
jobs. The `segment_size` argument is used to define the maximum number of images that
can be uploaded per job. 

If the number of usernames provided is less than the number of tasks or jobs,
the last username will be assigned multiple times. If there are more usernames
than tasks or jobs, the excess usernames are unassigned.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(5)

    task_assignee = "username1"
    job_asignees = ["username2", "username3"]
    job_reviewers = ["username4", "username5", "username6", "username7"]

    # Load "ground_truth" field into one task
    # Create another task for "keypoints" field
    label_schema = {
        "ground_truth": {},
        "keypoints": {
            "type": "keypoints",
            "classes": ["person"],
        }
    }

    info = view.annotate(
        label_schema=label_schema,
        task_assignee=task_assignee,
        job_asignees=job_asignees,
        job_reviewers=job_reviewers,
        segment_size=2,
        launch_editor=True,
    )


Scalar labels
-------------

FiftyOne |Label| fields are the primary way to store information in a
|Dataset|. However, FiftyOne also provides the ability to store scalar
information on samples. This information can be annotated in CVAT similarly to
how classifications are handled. 

Float, int, string, and boolean scalar types are supported. The `label_field`
argument is used just like for |Label| fields, but the `classes` argument is
now optional and the `attributes` argument is unused. 

If `classes` are provided, then the CVAT tag will allow you to select from this
list. If `classes` is `None`, then the CVAT tag will show the `label_field`
name and you must enter the value of the scalar in the `value` attribute of the
tag in CVAT.


.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    # Create two scalar fields
    # One with classes and one without
    label_schema = {
        "scalar1": {
            "type": "scalar",
        },
        "scalar2": {
            "type": "scalar",
            "classes": ["class1", "class2", "class3"],
        }
    }

    info = view.annotate(
        label_schema=label_schema,
        launch_editor=True,
    )

.. image:: /images/integrations/cvat_scalar.png
   :alt: cvat-scalar
   :align: center


Upload alternate media
----------------------

In some cases, the media that is uploaded for annotation may differ from what
is stored in the dataset. For example, a private dataset composed of images of public
spaces may need to anonymize faces and license plates be before uploading
samples to an annotation service.

The easiest way to approach this is to store the alternate media files on disk
and create a new field for every |Sample| in the |Dataset| storing the filepath to
the alternate media. When annotating the samples, provide this new field to the
`media_field` argument.

For example, say we want to upload blurred images to CVAT:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import cv2
    import os

    def create_alternate_media(sample, directory):
        filepath = sample.filepath
        filename = os.path.basename(filepath)
        alt_filepath = os.path.join(directory, filename)

        img = cv2.imread(filepath)
        processed_img = cv2.blur(img, (20,20))
        cv2.imwrite(alt_filepath, processed_img)

        sample["alt_filepath"] = alt_filepath
        sample.save()


    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(1)

    alt_dir = "/tmp/alternate_media_example"
    if not os.path.exists(alt_dir):
        os.makedirs(alt_dir)

    for sample in view:
        create_alternate_media(sample, alt_dir)

    info = view.annotate(
        label_field="ground_truth",
        media_field="alt_filepath",
        launch_editor=True,
    )

    # Annotate in CVAT

    view.load_annotations(info, delete_tasks=True)

.. image:: /images/integrations/cvat_alt_media.png
   :alt: cvat-alt-media
   :align: center

    

Videos
______

While CVAT supports video annotation, it only allows for a single video per
task. For video samples, every video will be uploaded to a separate task.

CVAT also does not provided a straightforward way to annotate video-level
labels like |Classifications|. It is recommended to use FiftyOne |tags| for
|Sample|-level classifications on a video |Dataset|.

|Frame|-level labels can be annotated in CVAT through this integration. Label
fields for |Frame|-level labels must be prepended by `"frames."`.

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    
    dataset = foz.load_zoo_dataset("quickstart-video")
    view = dataset.take(1)

    info = view.annotate(
        label_field="frames.ground_truth_detections",
        launch_editor=True,
    )

    # Annotate in CVAT

    view.load_annotations(info, delete_tasks=True)
