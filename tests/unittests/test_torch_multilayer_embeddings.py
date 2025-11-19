"""
FiftyOne torch multilayer embeddings unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import torch
import torch.nn as nn
import numpy as np

import fiftyone.utils.torch as fout


class SimpleTorchModel(nn.Module):
    def __init__(self, num_layers=3):
        super().__init__()
        self.layers = nn.ModuleList()
        input_size = 10
        for i in range(num_layers):
            output_size = input_size + 10
            self.layers.append(nn.Linear(input_size, output_size))
            input_size = output_size

    def forward(self, x):
        for layer in self.layers:
            x = layer(x)
        return x


class SimpleFiftyOneTorchModelConfig(fout.FiftyOneTorchModelConfig):
    pass


class SimpleFiftyOneTorchModel(fout.FiftyOneTorchModel):
    def flatten_multilayer_embeddings(self, outputs):
        flattened = outputs
