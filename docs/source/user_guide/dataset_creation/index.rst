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

Ingest a directory of images into FiftyOne and explore them in the FiftyOne
App:

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

Loading datasets
----------------

Depending on the state of your data, FiftyOne provides a few different options
for loading it. See the table below to figure out which option is best for you!


.. tabs::

    .. tab:: I have data in a custom format 

        .. tabs::

            .. tab:: My images are stored as individual files

                :doc:`Adding samples to your Dataset<samples>`
                
                You will build a |Dataset| by iterating over your 
                images and labels and creating a FiftyOne |Sample| for each 
                image.

                .. code-block:: python
                    :linenos:

                    import fiftyone as fo
                    
                    num_samples = 100
                    images_patt = "/path/to/images/%06d.jpg"

                    label_field = "ground_truth"
                    labels = {"/path/to/images/000001.jpg": "dog", ....}
                    
                    # Generate some labeled image samples
                    samples = []
                    for i in range(num_samples):
                        # Path to the image on disk
                        filepath = images_patt % i
                        label = labels[filepath]

                        sample = fo.Sample(filepath=filepath)
                        sample[label_field] = fo.Classification(label=label)
                        samples.append(sample)
                    
                    # Create the dataset
                    dataset = fo.Dataset("classification-dataset")
                    dataset.add_samples(samples)


                .. tabs::

                    .. tab:: Unlabeled images
                    
                      .. code:: python
                          :linenos:
                    
                          import fiftyone as fo
                          
                          num_samples = 100
                          images_patt = "/path/to/images/%06d.jpg"
      
                          # Load your unlabeled image samples
                          samples = []
                          for i in range(num_samples):
                              # Path to the image on disk
                              filepath = images_patt % i

                              samples.append(fo.Sample(filepath=filepath))
                          
                          # Create the dataset
                          dataset = fo.Dataset("unlabeled-dataset")
                          dataset.add_samples(samples)                    

                    .. tab:: Classification
                    
                      .. code:: python
                          :linenos:

                          import fiftyone as fo
                          
                          num_samples = 100
                          images_patt = "/path/to/images/%06d.jpg"
      
                          label_field = "ground_truth"
                          labels = {"/path/to/images/000001.jpg": "dog", ....}
                          
                          # Load your labeled image samples
                          samples = []
                          for i in range(num_samples):
                              # Path to the image on disk
                              filepath = images_patt % i
                              label = labels[filepath]
      
                              sample = fo.Sample(filepath=filepath)
                              sample[label_field] = fo.Classification(label=label)
                              samples.append(sample)
                          
                          # Create the dataset
                          dataset = fo.Dataset("classification-dataset")
                          dataset.add_samples(samples)
                    
                    .. tab:: Detection
                    
                      .. code:: python
                          :linenos:
                    
                          import fiftyone as fo
                    
                          num_samples = 100
                          images_patt = "/path/to/images/%06d.jpg"
      
                          label_field = "ground_truth"
                          annotations = {"/path/to/images/000001.jpg": [{"bbox":...}], ...}
                    
                          # Load your detection samples
                          samples = []
                          for i in range(num_samples):
                              # Path to the image on disk
                              filepath = images_patt % i
                    
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
                    
                          import random
                    
                          import eta.core.data as etad
                          import eta.core.geometry as etag
                          import eta.core.image as etai
                          import eta.core.objects as etao
                    
                          import fiftyone as fo
                    
                    
                          num_samples = 3
                          num_objects_per_sample = 4
                          label_field = "ground_truth"
                          images_patt = "/path/to/images/%06d.jpg"


                          annotations = {"/path/to/images/000001.jpg": 
                                "label": ...,
                                "objects": [{"bbox":..., "label":..., "age":...}],
                          ...}
                    
                          # Load your multitask labels 
                          samples = []
                          for i in range(num_samples):
                              # Path to the image on disk
                              filepath = images_patt % i
                    
                              image_labels = etai.ImageLabels()
                    
                              # Frame-level classifications
                              label = annotations[filepath]["label"]
                              image_labels.add_attribute(etad.CategoricalAttribute("label", label))
                    
                              # Object detections
                              for j in range(num_objects_per_sample):
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

                    The above example shows how to load a classification |Dataset|.

                    :doc:`Click here<samples>` to find out how to load an 
                    unlabeled, detection, or multitask prediction |Dataset| 
                    and more!

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

                You then need to load your labels into each |Sample| of the
                |Dataset|.


                .. code-block:: python
                    :linenos:

                    labels = # Some way for you to access labels for each image
                    label_field = "ground_truth"

                    for sample in dataset:
                        label = labels[sample.filepath]

                        # Add your label field
                        sample[label_field] = fo.Classification(label=label)
                        sample.save()


                .. note::

                    The second portion of the above example shows how to load a 
                    classification |Dataset|. 

                    :doc:`Click here<samples>` to find out how to load an unlabeled,
                    detection, or multitask prediction |Dataset| and
                    more!


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
           
            :doc:`Click here<datasets>` to learn more about loading datasets by type!


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
        then the recommended option is to wrap it in a FiftyOne SampleParser.
        For example, a `torchvision.dataset` is a parser for various datasets
        that has been wrapped in a FiftyOne SampleParser.

        :ref:`Writing a custom SampleParser<Writing a custom SampleParser>` will allow you to use the
        ``dataset.add_labeled_images()`` and ``dataset.ingest_labeled_images()``
        functions directly without having to loop over the dataset again to add
        your labels. Additionally, this will allow FiftyOne to load your
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



    .. tab:: I don't have a data parser

        If you don't have a dedicated way of parsing your samples yet, then the
        recommended option is to create a custom DatasetImporter.
        DatasetImporters import your images and labels to disk and are used to
        easily generate Datasets.

        Writing your own DatasetImporter will allow you to use
        ``dataset.from_importer()`` to load your dataset directly without
        needing to create individual samples. Additionally, this will allow FiftyOne to load your
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



        if you want to take this a step further, you can write a custom
        Dataset type to gain access to the command ``dataset.from_dir()`` and
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


.. comment
    ..tabs::
        .. tab:: I am a Poweruser
    
            .. tabs::
    
                .. tab:: Images are stored as separate files
    
                    .. tabs::
    
                        .. tab:: I have a parser for my data
    
                            You should then use your parser to iterate over your data
                            and load each image and label into a FiftyOne Sample.
    
                        .. tab:: I don't have a good way of parsing my data
    
                            To then build a dataset, you could either convert your data
                            to a common format or write a script to load each image and
                            label into a Sample.
                            
                            (For Powerusers) Write a DatasetImporter to parse and load
                            each image and labels through FiftyOne. This allows for
                            batch loading of Samples for maximum efficiency.
    
                .. tab:: Images are stored in blobs (e.g. H5PY, Numpy, etc)
    
                    .. tabs::
    
                        .. tab:: I have a parser for my data
    
                            You will want to first ingest your data (save each image as
                            a separate file) since FiftyOne does not load images into
                            memory, only image paths.
    
                            You should then use your parser to iterate over your data
                            and load each image and label into a FiftyOne Sample.
    
                        .. tab:: I don't have a good way of parsing my data
    
                            You will want to first ingest your data (save each image as
                            a separate file) since FiftyOne does not load images into
                            memory, only image paths.                   
    
                            To then build a dataset, you could either convert your data
                            to a common format or write a script to load each image and
                            label into a Sample.
                            
                            (For Powerusers) Write a DatasetImporter to parse and load
                            each image and labels through FiftyOne. This allows for
                            batch loading of Samples for maximum efficiency.
    


.. comment
    .. tabs::
        If you are someone who needs the absolute fastest way to load data, or
        you will be continuously loading various datasets in your custom
        format, then these options will point you to the right place.
    	
    	.. tab:: I have data
    
            .. tabs:: 
    
                .. tab:: Images stored individually
        
                    .. tabs::
        		    
                        .. tab:: I have a parser
                            
                            SampleParser add_images()
    
                        .. tab:: I don't have a parser
                            
                            DatasetImporter add_images()
        
        
                .. tab:: Images stored in a blob 
        
                    .. tabs::
        		    
                        .. tab:: I have a parser
    
                            SampleParser ingest_images()
        
                        .. tab:: I don't have a parser
    
                            DatasetImporter ingest_images()
    
        .. tab:: I don't have data
            
            foz.load_zoo_dataset("coco-2017")


.. comment
    There are three basic ways to get data into FiftyOne:
    
    - :doc:`Loading datasets from disk<datasets>`
    
    FiftyOne natively supports creating datasets in a variety of common formats,
    including
    `COCO <https://cocodataset.org/#home>`_,
    `VOC <http://host.robots.ox.ac.uk/pascal/VOC>`_,
    `CVAT <https://github.com/opencv/cvat>`_,
    `BDD <https://bdd-data.berkeley.edu>`_,
    `TFRecords <https://github.com/tensorflow/models/tree/master/research/object_detection>`_,
    and more. You can also extend FiftyOne by providing your own |DatasetImporter|
    to load datasets in your own custom formats.
    
    - :doc:`Adding samples to datasets<samples>`
    
    FiftyOne provides a number of options for building datasets from samples. You
    can take a fully customized approach and build your own |Sample| instances, or
    you can a builtin |SampleParser| clasess to parse samples from a variety of
    common formats, or you can provide your own |SampleParser| to automatically
    load samples in your own custom formats.
    
    - :doc:`Zoo datasets<zoo>`
    
    FiftyOne provides a Dataset Zoo that contains a variety of popular open source
    datasets like
    `CIFAR-10 <https://www.cs.toronto.edu/~kriz/cifar.html>`_,
    `COCO <https://cocodataset.org/#home>`_, and
    `ImageNet <http://www.image-net.org>`_
    that can be downloaded and loaded into FiftyOne with a single line of code.

.. toctree::
   :maxdepth: 1
   :hidden:

   Loading datasets <datasets>
   Loading samples <samples>
   Zoo datasets <zoo>
