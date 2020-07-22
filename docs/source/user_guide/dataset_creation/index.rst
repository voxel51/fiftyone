Loading data into FiftyOne
==========================

.. default-role:: code
.. include:: ../../substitutions.rst

The first step to using FiftyOne is to load your data into a FiftyOne 
|WhatIsADataset|. FiftyOne supports automatic loading of datasets stored in 
various common formats. If your dataset is stored in a custom format, don't 
worry, FiftyOne also provides support for easily loading datasets in custom 
formats.

.. note::

    When you create a |WhatIsAFiftyOneDataset|, its samples and all of their
    fields (metadata, labels, custom fields, etc.) are written to FiftyOne's
    backing database.

    Note that samples only store the `filepath` to the media, not the
    raw media itself. FiftyOne does not create duplicate copies of your data!

Quickstart
----------

Load a directory of unlabeled images into FiftyOne and explore them in the 
FiftyOne App:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        dataset_dir = "/path/to/images-dir"

        # Visualize a directory of images in the FiftyOne App
        dataset = fo.Dataset.from_dir(dataset_dir, fo.types.ImageDirectory)
        session = fo.launch_app(dataset=dataset)

  .. group-tab:: CLI

    .. code:: shell

        # Visualize a directory of images in the FiftyOne App
        fiftyone app view \
            --dataset-dir /path/to/images-dir --type fiftyone.types.ImageDirectory

Loading labeled datasets
------------------------

Depending on the format of your labels, FiftyOne provides a few different 
options for loading your |Dataset|. See the tabs below to figure out which 
option is best for you.


.. tabs::

    .. tab:: I have data in a custom format 

        .. tabs::

            .. tab:: My images are stored as individual files

                :doc:`Adding samples to your Dataset<samples>`
                
                The recommended approach to loading a |Dataset| is
                by iterating over your images and labels and creating 
                a FiftyOne |Sample| for each image/label pair.

                .. tabs::

                    .. tab:: Unlabeled images
                    
                      .. code:: python
                          :linenos:

                          import glob
                    
                          import fiftyone as fo
                          
                          image_directory = "/path/to/images/*"
      
                          # Load your unlabeled image samples
                          samples = []

                          #Example: One way of iterating over image filepaths
                          for filepath in glob.glob(image_directory):
                              samples.append(fo.Sample(filepath=filepath))
                          
                          # Create the dataset
                          dataset = fo.Dataset("unlabeled-dataset")
                          dataset.add_samples(samples)                    

                    .. tab:: Classification
                    
                      .. code:: python
                          :linenos:

                          import glob

                          import fiftyone as fo
                          
                          images_directory = "/path/to/images/*"
                          label_field = "ground_truth"

                          # For example, some custom label format 
                          annotations = {"/path/to/images/000001.jpg": "dog", ....}
                          
                          # Load your labeled image samples
                          samples = []

                          # Example: One way of iterating over image filepaths
                          for filepath in glob.glob(image_directory):
                              label = annotations[filepath]
      
                              sample = fo.Sample(filepath=filepath)
                              sample[label_field] = fo.Classification(label=label)
                              samples.append(sample)
                          
                          # Create the dataset
                          dataset = fo.Dataset("classification-dataset")
                          dataset.add_samples(samples)
                    
                    .. tab:: Detection
                    
                      .. code:: python
                          :linenos:
                            
                          import glob

                          import fiftyone as fo
                    
                          images_directory = "/path/to/images/*"
                          label_field = "ground_truth"

                          # For example, some custom label format 
                          annotations = {"/path/to/images/000001.jpg": [{"bbox":..., "label":...}], ...}
                    
                          # Load your detection samples
                          samples = []

                          # Example: One way of iterating over image filepaths
                          for filepath in glob.glob(image_directory):

                              # Object detections
                              detections = []
                              for det in annotations[filepath]:
                                  label = det["label"]

                                  # Relative coordinates ranging from 0 to 1
                                  # [top-left-x, top-left-y, width, height] 
                                  bounding_box = det["bbox"]

                                  detections.append(fo.Detection(label=label, bounding_box=bounding_box))
                    
                              sample = fo.Sample(filepath=filepath)
                              sample[label_field] = fo.Detections(detections=detections)
                              samples.append(sample)
                    
                          # Create the dataset
                          dataset = fo.Dataset("detection-dataset")
                          dataset.add_samples(samples)
                    
                    .. tab:: Multitask prediction
                    
                      .. code:: python
                          :linenos:

                          import glob
                    
                          import eta.core.data as etad
                          import eta.core.geometry as etag
                          import eta.core.image as etai
                          import eta.core.objects as etao
                    
                          import fiftyone as fo
                    
                          images_directory = "/path/to/images/*"
                          label_field = "ground_truth"

                          # For example, some custom label format 
                          annotations = {"/path/to/images/000001.jpg": 
                                "label": ...,
                                "objects": [{"bbox":..., "label":..., "age":...}],
                          ...}
                    
                          # Load your multitask labels 
                          samples = []

                          # Example: One way of iterating over image filepaths
                          for filepath in glob.glob(image_directory):
                    
                              image_labels = etai.ImageLabels()
                    
                              # Frame-level classifications
                              label = annotations[filepath]["label"]
                              image_labels.add_attribute(etad.CategoricalAttribute("label", label))
                    
                              # Object detections
                              for det in annotations[filepath]["objects"]:
                                  label = det["label"]
                    
                                  # Relative coordinates ranging from 0 to 1
                                  # [top-left-x, top-left-y, bottom-right-x, bottom-right-y]
                                  bbox = det["bbox"]
                                  bounding_box = etag.BoundingBox.from_coords(bbox)
                    
                                  obj = etao.DetectedObject(label=label, bounding_box=bounding_box)
                    
                                  # Object attributes
                                  age = det["age"]
                                  obj.add_attribute(etad.NumericAttribute("age", age))
                    
                                  image_labels.add_object(obj)

                              sample = fo.Sample(filepath=filepath)
                              sample[label_field] =fo.ImageLabels(labels=image_labels))
                              samples.append(sample)                   
                    
                          # Create the dataset
                          dataset = fo.Dataset("multitask-dataset")
                          dataset.add_samples(samples)
                    

                .. note::

                    :doc:`Click here<samples>` to find out more information
                    about loading samples into a |Dataset|.

            .. tab:: My images are **not** stored as individual files

                :doc:`Adding samples to your Dataset<samples>`

                The following method is useful if you have:

                - Images stored together in a binary format like TFRecords, 
                  Numpy, etc. 
                - Images in a temporary directory that you want to copy into a
                  common backing location
                - Images in memory that do not correspond to a file on disk

                First you will want to *ingest* your images into FiftyOne.
                Ingesting data means saving each image individually in a 
                backing directory. This is required because FiftyOne
                does not store images in memory and only loads them as
                needed.

                .. code-block:: python
                    :linenos: 

                    import fiftyone as fo
                    import fiftye.utils.data as foud

                    dataset = fo.Dataset()

                    sample_parser = foud.ImageSampleParser

                    dataset_dir = "/path/to/my/directory"

                    dataset.ingest_images(samples, sample_parser, dataset_dir=dataset_dir)

                .. note::

                    :ref:`Click here<Ingesting samples into datasets>` to learn 
                    more about ingesting samples!

                If you just want to load your unlabeled images you can stop
                here. Otherwise you now need to load your labels into each 
                |Sample| of the |Dataset|.

                
                .. tabs::

                    .. tab:: Classification

                        .. code-block:: python
                            :linenos:

                            label_field = "ground_truth"

                            # For example, some custom label format 
                            annotations = {"/path/to/images/000001.jpg": "dog", ....}

                            for sample in dataset:
                                label = annotations[sample.filepath]

                                # Add your label field
                                sample[label_field] = fo.Classification(label=label)
                                sample.save()

                    .. tab:: Detection

                        .. code-block:: python
                            :linenos:

                            label_field = "ground_truth"

                            # For example, some custom label format 
                            annotations = {"/path/to/images/000001.jpg": [{"bbox":..., "label":...}], ...}

                            for sample in dataset:
                              # Object detections
                              detections = []
                              for det in annotations[sample.filepath]:
                                  label = det["label"]

                                  # Relative coordinates ranging from 0 to 1
                                  # [top-left-x, top-left-y, width, height] 
                                  bounding_box = det["bbox"]

                                  detections.append(fo.Detection(label=label, bounding_box=bounding_box))
                    
                              sample[label_field] = fo.Detections(detections=detections)
                              sample.save()

                    .. tab:: Multitask prediction 

                        .. code-block:: python
                            :linenos:

                            label_field = "ground_truth"

                            # For example, some custom label format 
                            annotations = {"/path/to/images/000001.jpg": 
                                  "label": ...,
                                  "objects": [{"bbox":..., "label":..., "age":...}],
                            ...}


                            for sample in dataset:
                    
                              image_labels = etai.ImageLabels()
                    
                              # Frame-level classifications
                              label = annotations[filepath]["label"]
                              image_labels.add_attribute(etad.CategoricalAttribute("label", label))
  
                              # Object detections
                              for det in annotations[filepath]["objects"]:
                                  label = det["label"]
                    
                                  # Relative coordinates ranging from 0 to 1
                                  # [top-left-x, top-left-y, bottom-right-x, bottom-right-y]
                                  bbox = det["bbox"]
                                  bounding_box = etag.BoundingBox.from_coords(bbox)
                    
                                  obj = etao.DetectedObject(label=label, bounding_box=bounding_box)
                    
                                  # Object attributes
                                  age = det["age"]
                                  obj.add_attribute(etad.NumericAttribute("age", age))
                    
                                  image_labels.add_object(obj)

                              sample[label_field] =fo.ImageLabels(labels=image_labels))
                              sample.save()


                .. note::

                    :doc:`Click here<samples>` to find out more information
                    about loading labeled samples into a |Dataset|.


    .. tab:: I have data in a common format 

        :doc:`Loading Datasets from disk<datasets>`

        FiftyOne provides ways to automatically load your data if it is stored
        in one of the following formats:
        
        - :ref:`ImageDirectory`                      
        - :ref:`FiftyOneImageClassificationDataset`  
        - :ref:`ImageClassificationDirectoryTree`    
        - :ref:`TFImageClassificationDataset`        
        - :ref:`FiftyOneImageDetectionDataset`       
        - :ref:`COCODetectionDataset`                
        - :ref:`VOCDetectionDataset`                 
        - :ref:`KITTIDetectionDataset`               
        - :ref:`TFObjectDetectionDataset`            
        - :ref:`CVATImageDataset`                    
        - :ref:`FiftyOneImageLabelsDataset`          
        - :ref:`BDDDataset`                          

        If none of these formats match, then click another tab to see how to
        load a |Dataset| in a custom format.

        If one of these |Dataset| types does match your data, you can load it
        with the following code. 

        .. code-block:: python
            :linenos:

            import fiftyone as fo

            # A name for the dataset
            name = "my-dataset"
            
            # The directory containing the dataset to import
            dataset_dir = "/path/to/dataset"

            # The type of the dataset being imported
            # Any subclass of `fiftyone.types.Dataset` is supported
            dataset_type = fo.types.COCODetectionDataset  # for example

            dataset = fo.Dataset.from_dir(dataset_dir, dataset_type, name=name)


        .. note::
           
            :doc:`Click here<datasets>` to learn more about loading datasets by type.


    .. tab:: I don't have data 

        :doc:`FiftyOne Dataset Zoo<zoo>`

        Check out the :doc:`FiftyOne Dataset Zoo<zoo>` to automatically load and download a
        popular image dataset. 

        You can list available zoo datasets using the following code:

        .. code-block:: python
            :linenos:

            import fiftyone.zoo as foz

            print(foz.list_zoo_datasets())


        .. code-block:: shell

            ['coco-2014',
             'coco-2017',
             'imagenet-2012',
             'voc-2007',
             'cifar100',
             'kitti',
             'mnist',
             'voc-2012',
             'cifar10',
             'fashion-mnist',
             'caltech101']


        Any of these zoo datasets can then be downloaded and loaded into
        FiftyOne using a single line of code. 

        .. code-block:: python

           import fiftyone.zoo as foz

           dataset = foz.load_zoo_dataset("cifar10", split="train")


        .. note::
            
            The FiftyOne Zoo uses the
            `TensorFlow Datasets <https://www.tensorflow.org/datasets>`_ or
            `TorchVision Datasets <https://pytorch.org/docs/stable/torchvision/datasets.html>`_
            libraries to wrangle the datasets, depending on which you have
            installed. More information can be found 
            :ref:`here<Customizing your ML backend>`.
            
        
            
Advanced loading options
------------------------

If you have data stored in a custom format, then there are more direct ways of
loading a |Dataset| than adding samples manually. 
The following techniques will show you how to implement your own classes that
can speed up the |Dataset| loading process and allow
you to more easily load various datasets from disk if they are in your custom
format.

.. tabs::
    
    .. tab:: I have a data parser

        If you already have a way to efficiently parse your data into python,
        then the recommended option is to wrap it in a FiftyOne |SampleParser|.
        For example, a `torchvision.dataset` is a parser for various datasets
        that has been wrapped in a FiftyOne |SampleParser|.

        :ref:`Writing a custom SampleParser<Writing a custom SampleParser>` will allow you to use:

        - :meth:`dataset.add_labeled_images()<fiftyone.core.dataset.Dataset.add_labeled_images>`
        - :meth:`dataset.ingest_labeled_images()<fiftyone.core.dataset.Dataset.ingest_labeled_images>`

        Additionally, this will allow FiftyOne to load your
        samples in batches for improved loading times.

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            
            dataset = fo.Dataset()
            
            # An iterable of `(image_or_path, anno_or_path)` tuples and the SampleParser
            # to use to parse the tuples
            samples = ...
            sample_parser = CustomSampleParser(...)

            # Add images to the dataset
            dataset.add_labeled_images(samples, sample_parser)
            
            # OR

            # If ingesting images
            # A directory in which the images will be written; If `None`, a default directory
            # based on the dataset's `name` will be used
            dataset_dir = ...

            # Ingest the images into the dataset
            # The source images are copied into `dataset_dir`
            dataset.ingest_labeled_images(samples, sample_parser, dataset_dir=dataset_dir)            


        .. note::

            :ref:`Click here<Writing a custom SampleParser>` to see how to 
            implement a custom |SampleParser|.

    .. tab:: I don't have a data parser

        If you don't have a dedicated way of parsing your samples yet, then the
        recommended option is to create a custom |DatasetImporter|.
        A |DatasetImporter| will import your images and labels to disk and 
        are is used to easily generate a |Dataset|.

        :ref:`Writing your own DatasetImporter<Writing a custom Dataset type>` 
        will allow you to use:

        - :meth:`dataset.from_importer()<fiftyone.core.dataset.Dataset.from_importer>` 
         
        Additionally, this will allow FiftyOne to load your
        samples in batches for improved loading times.


        .. code-block:: python
            :linenos:

            import fiftyone as fo
            
            name = "custom-dataset"
            dataset_dir = "/path/to/custom-dataset"
            
            # Create an instance of your custom dataset importer
            importer = CustomDatasetImporter(dataset_dir, ...)
            
            # Import the dataset!
            dataset = fo.Dataset.from_importer(importer, name=name)

        .. note::
            :ref:`Click here<Writing a custom DatasetImporter>` to see how to 
            implement a custom |DatasetImporter|.


        if you want to take this a step further, you can write a custom
        Dataset type to gain access to the command 
        :meth:`dataset.from_dir()<fiftyone.core.dataset.Dataset.from_dir>` and
        to be able to export your |Dataset|.

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            
            name = "custom-dataset"
            dataset_dir = "/path/to/custom-dataset"
            
            # The `fiftyone.types.Dataset` subclass for your custom dataset
            dataset_type = CustomLabeledDataset
            
            # Import the dataset!
            dataset = fo.Dataset.from_dir(dataset_dir, dataset_type, name=name)


        .. note::
            :ref:`Click here<Writing a custom Dataset type>` to see how to 
            implement a custom |Dataset| type.


.. toctree::
   :maxdepth: 1
   :hidden:

   Loading datasets <datasets>
   Loading samples <samples>
   Zoo datasets <zoo>
