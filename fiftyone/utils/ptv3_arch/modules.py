"""
Point module containers for Point Transformer V3.

Vendored from Pointcept (https://github.com/Pointcept/Pointcept), MIT License.
See ``__init__.py`` for attribution.
"""

import sys
import torch.nn as nn
import spconv.pytorch as spconv

try:
    import ocnn
except ImportError:
    ocnn = None

from collections import OrderedDict
from .structure import Point


def is_ocnn_module(module):
    if ocnn is not None:
        ocnn_modules = (
            ocnn.nn.OctreeConv,
            ocnn.nn.OctreeDeconv,
            ocnn.nn.OctreeGroupConv,
            ocnn.nn.OctreeDWConv,
        )
        return isinstance(module, ocnn_modules)
    else:
        return False


class PointModule(nn.Module):
    r"""PointModule
    placeholder, all module subclass from this will take Point in PointSequential.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)


class PointSequential(PointModule):
    r"""A sequential container.
    Modules will be added to it in the order they are passed in the constructor.
    Alternatively, an ordered dict of modules can also be passed in.
    """

    def __init__(self, *args, **kwargs):
        super().__init__()
        if len(args) == 1 and isinstance(args[0], OrderedDict):
            for key, module in args[0].items():
                self.add_module(key, module)
        else:
            for idx, module in enumerate(args):
                self.add_module(str(idx), module)
        for name, module in kwargs.items():
            if sys.version_info < (3, 6):
                raise ValueError("kwargs only supported in py36+")
            if name in self._modules:
                raise ValueError("name exists.")
            self.add_module(name, module)

    def __getitem__(self, idx):
        if not (-len(self) <= idx < len(self)):
            raise IndexError("index {} is out of range".format(idx))
        if idx < 0:
            idx += len(self)
        it = iter(self._modules.values())
        for i in range(idx):
            next(it)
        return next(it)

    def __len__(self):
        return len(self._modules)

    def add(self, module, name=None):
        if name is None:
            name = str(len(self._modules))
            if name in self._modules:
                raise KeyError("name exists")
        self.add_module(name, module)

    def forward(self, input):
        for k, module in self._modules.items():
            # Point module
            if isinstance(module, PointModule):
                input = module(input)
            # Spconv module
            elif spconv.modules.is_spconv_module(module):
                if isinstance(input, Point):
                    input.sparse_conv_feat = module(input.sparse_conv_feat)
                    input.feat = input.sparse_conv_feat.features
                else:
                    input = module(input)
            elif is_ocnn_module(module):
                if isinstance(input, Point):
                    input.octree.features[-1] = module(
                        input.feat[input.octree_order],
                        input.octree,
                        input.octree.depth,
                    )
                    input.feat = input.octree.features[-1][input.octree_inverse]
                else:
                    input = module(input)
            # PyTorch module
            else:
                if isinstance(input, Point):
                    input.feat = module(input.feat)
                    if "sparse_conv_feat" in input.keys():
                        input.sparse_conv_feat = (
                            input.sparse_conv_feat.replace_feature(input.feat)
                        )
                elif isinstance(input, spconv.SparseConvTensor):
                    if input.indices.shape[0] != 0:
                        input = input.replace_feature(module(input.features))
                else:
                    input = module(input)
        return input
