.. _workflows-training:

Model Training
==============

FiftyOne integrates with your training framework rather than replacing it:
curate a dataset or view in FiftyOne, then stream it into your training loop.
The FiftyOne Torch dataset utilities work with vanilla PyTorch, PyTorch
Lightning, and Hugging Face training pipelines, and integrations like
:doc:`Detectron2 <../tutorials/detectron2.ipynb>` and Ultralytics YOLO show
end-to-end fine-tuning on FiftyOne datasets.

.. toctree::
   :maxdepth: 1
   :hidden:

   Data Loading with Torch Datasets <../recipes/fiftyone_torch_dataloader.ipynb>
   Torch dataset basics <../recipes/torch-dataset-examples/basic_example.ipynb>
   Training on MNIST with Torch <../recipes/torch-dataset-examples/simple_training_example.ipynb>
   Speed Up FiftyOneTorchDataset with Vectorize Mode <../recipes/torch-dataset-examples/the_cache_field_names_argument.ipynb>
   Training with Detectron2 <../tutorials/detectron2.ipynb>
   Fine-tuning YOLOv8 models <../tutorials/yolov8.ipynb>
