
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| Dataset Type                                                       | Description                                                                        |
+====================================================================+====================================================================================+
| :class:`ImageDirectory \                                           | A directory of images.                                                             |
| <fiftyone.types.dataset_types.ImageDirectory>`                     |                                                                                    |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`FiftyOneImageClassificationDataset \                       | A labeled dataset consisting of images and their associated classification labels  |
| <fiftyone.types.dataset_types.FiftyOneImageClassificationDataset>` | in a simple JSON format.                                                           |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`ImageClassificationDirectoryTree \                         | A directory tree whose subfolders define an image classification dataset.          |
| <fiftyone.types.dataset_types.ImageClassificationDirectoryTree>`   |                                                                                    |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`TFImageClassificationDataset \                             | A labeled dataset consisting of images and their associated classification labels  |
| <fiftyone.types.dataset_types.TFImageClassificationDataset>`       | stored as TFRecords.                                                               |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`FiftyOneImageDetectionDataset \                            | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.FiftyOneImageDetectionDataset>`      | stored in a simple JSON format.                                                    |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`COCODetectionDataset \                                     | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.COCODetectionDataset>`               | saved in `COCO format <http://cocodataset.org/#home>`_.                            |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`VOCDetectionDataset \                                      | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.VOCDetectionDataset>`                | saved in `VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.                   |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`KITTIDetectionDataset \                                    | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.KITTIDetectionDataset>`              | saved in `KITTI format <http://www.cvlibs.net/datasets/kitti/eval\_object.php>`_.  |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`TFObjectDetectionDataset \                                 | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.TFObjectDetectionDataset>`           | stored as TFRecords in `TF Object Detection API format \                           |
|                                                                    | <https://github.com/tensorflow/models/blob/master/research/object\_detection>`_.   |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`CVATImageDataset \                                         | A labeled dataset consisting of images and their associated object detections      |
| <fiftyone.types.dataset_types.CVATImageDataset>`                   | stored in `CVAT image format <https://github.com/opencv/cvat>`_.                   |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`FiftyOneImageLabelsDataset \                               | A labeled dataset consisting of images and their associated multitask predictions  |
| <fiftyone.types.dataset_types.FiftyOneImageLabelsDataset>`         | stored in `ETA ImageLabels format \                                                |
|                                                                    | <https://voxel51.com/docs/api/#types-imagelabels>`_.                               |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
| :class:`BDDDataset \                                               | A labeled dataset consisting of images and their associated multitask predictions  |
| <fiftyone.types.dataset_types.BDDDataset>`                         | saved in `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.       |
+--------------------------------------------------------------------+------------------------------------------------------------------------------------+
