"""
CLIP model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch
import numpy as np
from PIL import Image

mmengine = fou.lazy_import(
    "mmengine", callback=lambda: fou.ensure_package("mmengine")
)

torchvision = fou.lazy_import(
    "torchvision", callback=lambda: fou.ensure_package("torchvision")
)

logger = logging.getLogger(__name__)

class TorchOpenWorldModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`TorchOpenWorldModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        yolo_world_model ("yolov8l-world"): the Yolo World model to use
        classes (None): a list of custom classes for custom prediction
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.classes = d["classes"]
        
        self.yolo_model = self.parse_string(
            d, "yolo_world_model", default="yolov8l-world"
        )

        self.config_file_url = self.parse_dict(d, "config_file_url")[self.yolo_model]
        self.model_url = self.parse_dict(d, "model_url")[self.yolo_model]
        self.model_yolo_path = self.parse_dict(d, "config_yolo_file")

        self.config_file_path = os.path.join(
            fo.config.model_zoo_dir, "{}.py".format(self.yolo_model) 
        )

        self.model_path = os.path.join(
            fo.config.model_zoo_dir, "{}.pth".format(self.yolo_model)
        )

    def download_config_model_if_necessary(self):
        if not os.path.isfile(self.config_file_path):
            logger.info("Downloading YOLO WORLD config...")
            etaw.download_file(
                self.config_file_url, path=self.config_file_path
            )

        if not os.path.isfile(self.model_path):
            logger.info("Downloading YOLO WORLD model...")
            etaw.download_file(
                self.model_url, path=self.model_path
            )

        for yolo_model in self.model_yolo_path:
            if not os.path.isfile(os.path.join(fo.config.model_zoo_dir, yolo_model)):
                logger.info("Downloading {} model...".format(yolo_model))
                etaw.download_file(
                    self.model_yolo_path[yolo_model], path=os.path.join(fo.config.model_zoo_dir, yolo_model)
                )

class TorchOpenWorldModel(fout.TorchImageModel):
    """Torch implementation of YOLO WORLD from
    https://github.com/AILab-CVC/YOLO-World

    Args:
        config: a :class:`TorchOpenWorldModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)

    def _download_model(self, config):
        config.download_config_model_if_necessary()

    def _load_model(self, config):
        cfg = mmengine.config.Config.fromfile(config.config_file_path)
        cfg.work_dir = fo.config.model_zoo_dir
        cfg.load_from = config.model_path
        self.runner = mmengine.runner.Runner.from_cfg(cfg)
        self.runner.call_hook("before_run")
        self.runner.load_or_resume()
        pipeline = cfg.test_dataloader.dataset.pipeline
        self.runner.pipeline = mmengine.dataset.Compose(pipeline)
        self.runner.model.eval()
       

        return self.runner.model

    def _generate_detections(self, img, texts, index):
        path_image = fo.config.model_zoo_dir + "/temp.jpg"
        torchvision.utils.save_image(img, path_image)

        data_info = self.runner.pipeline(dict(img_id=index, img_path=path_image, texts=texts))
            
        data_batch = dict(
            inputs=data_info["inputs"].unsqueeze(0),
            data_samples=[data_info["data_samples"]],
        )
        
        with torch.no_grad(), mmengine.runner.amp.autocast(enabled=False):
            output = self.runner.model.test_step(data_batch)[0]

            self.runner.model.class_names = texts

            pred_instances = output.pred_instances

            pred_instances = pred_instances.cpu().numpy()

            if 0 in pred_instances['bboxes'].shape:
                return fo.Detections(detections=[])

            print(pred_instances)
            print(pred_instances['bboxes'])
            print(pred_instances['labels'])
            print(pred_instances['scores'])
            print(type(pred_instances['bboxes']))
            print(type(pred_instances['labels']))
            print(type(pred_instances['scores']))
            
            bboxes = pred_instances['bboxes']
            labels = pred_instances['labels']
            confs = pred_instances['scores']

            detections = [
                fo.Detection(label=l, confidence=c, bounding_box=b)
                for (l, c, b) in zip(labels, confs, bboxes)
            ]

        return fo.Detections(detections=detections)
    
    def _predict_all(self, imgs):
        if isinstance(imgs, (list, tuple)):
            imgs = torch.stack(imgs)

        if self._using_gpu:
            imgs = imgs.cuda()

        self.text = [[item] for item in self.classes]

        return [self._generate_detections(img, self.text, index) for index, img in enumerate(imgs)]