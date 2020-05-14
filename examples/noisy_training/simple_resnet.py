"""
Definition and Implementation of a Simple Resnet.
Only suitable for smallish data and customized for this walkthrough.

Based on the implementation of this is from David Page's work on fast model
training with resnets.  <https://github.com/davidcpage/cifar10-fast/>

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from os.path import normpath, sep
from collections import namedtuple, defaultdict
import copy
# @todo support Python 2.7 by handling singledispatch properly
from functools import partial, singledispatch
from itertools import chain
import time

import numpy as np
import torch
from torch import nn


# This is a small model with a fixed size, so let cudnn optimize
torch.backends.cudnn.benchmark = True


device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
cpu = torch.device("cpu")


## Utils; should they be moved elsewhere?
class Timer():
    def __init__(self, synch=None):
        self.synch = synch or (lambda: None)
        self.synch()
        self.times = [time.perf_counter()]
        self.total_time = 0.0

    def __call__(self, include_in_total=True):
        self.synch()
        self.times.append(time.perf_counter())
        delta_t = self.times[-1] - self.times[-2]
        if include_in_total:
            self.total_time += delta_t
        return delta_t


def path_iter(nested_dict, pfx=()):
    for name, val in nested_dict.items():
        if isinstance(val, dict): yield from path_iter(val, (*pfx, name))
        else: yield ((*pfx, name), val)


def group_by_key(items):
    res = defaultdict(list)
    for k, v in items:
        res[k].append(v)
    return res


union = lambda *dicts: {k: v for d in dicts for (k, v) in d.items()}


## Data Preprocessing and Handling
def preprocess(dataset, transforms):
    dataset = copy.copy(dataset) #shallow copy
    for transform in transforms:
        dataset['data'] = transform(dataset['data'])
    return dataset

@singledispatch
def normalise(x, mean, std):
    return (x - mean) / std

@normalise.register(np.ndarray)
def _(x, mean, std):
    #faster inplace for numpy arrays
    x = np.array(x, np.float32)
    x -= mean
    x *= 1.0/std
    return x

unnormalise = lambda x, mean, std: x*std + mean

@singledispatch
def to_numpy(x):
    raise NotImplementedError

@to_numpy.register(torch.Tensor)
def _(x):
    return x.detach().cpu().numpy()

@singledispatch
def pad(x, border):
    raise NotImplementedError

@pad.register(np.ndarray)
def _(x, border):
    return np.pad(x, [(0, 0), (border, border), (border, border), (0, 0)], mode='reflect')

@pad.register(torch.Tensor)
def _(x, border):
    return nn.ReflectionPad2d(border)(x)

@singledispatch
def transpose(x, source, target):
    raise NotImplementedError

@transpose.register(np.ndarray)
def _(x, source, target):
    return x.transpose([source.index(d) for d in target])

@transpose.register(torch.Tensor)
def _(x, source, target):
    return x.permute([source.index(d) for d in target])

class Crop(namedtuple('Crop', ('h', 'w'))):
    def __call__(self, x, x0, y0):
        return x[..., y0:y0+self.h, x0:x0+self.w]

    def options(self, shape):
        *_, H, W = shape
        return [{'x0': x0, 'y0': y0} for x0 in range(W+1-self.w) for y0 in range(H+1-self.h)]

    def output_shape(self, shape):
        *_, H, W = shape
        return (*_, self.h, self.w)

@singledispatch
def flip_lr(x):
    raise NotImplementedError

@flip_lr.register(np.ndarray)
def _(x):
    return x[..., ::-1].copy()

@flip_lr.register(torch.Tensor)
def _(x):
    return torch.flip(x, [-1])


class FlipLR(namedtuple('FlipLR', ())):
    def __call__(self, x, choice):
        return flip_lr(x) if choice else x

    def options(self, shape):
        return [{'choice': b} for b in [True, False]]

class Cutout(namedtuple('Cutout', ('h', 'w'))):
    def __call__(self, x, x0, y0):
        x[..., y0:y0+self.h, x0:x0+self.w] = 0.0
        return x

    def options(self, shape):
        *_, H, W = shape
        return [{'x0': x0, 'y0': y0} for x0 in range(W+1-self.w) for y0 in range(H+1-self.h)]


class Transform():
    def __init__(self, dataset, transforms):
        self.dataset, self.transforms = dataset, transforms
        self.choices = None

    def __len__(self):
        return len(self.dataset)

    def __getitem__(self, index):
        data, labels = self.dataset[index]
        data = data.copy()
        for choices, f in zip(self.choices, self.transforms):
            data = f(data, **choices[index])
        return data, labels

    def set_random_choices(self):
        self.choices = []
        x_shape = self.dataset[0][0].shape
        N = len(self)
        for t in self.transforms:
            self.choices.append(np.random.choice(t.options(x_shape), N))
            x_shape = t.output_shape(x_shape) if hasattr(t, 'output_shape') else x_shape



## Utils

class PiecewiseLinear(namedtuple('PiecewiseLinear', ('knots', 'vals'))):
    def __call__(self, t):
        return np.interp([t], self.knots, self.vals)[0]

class Const(namedtuple('Const', ['val'])):
    def __call__(self, x):
        return self.val

## Define the network

has_inputs = lambda node: type(node) is tuple

def build_graph(net):
    flattened = pipeline(net)
    resolve_input = lambda rel_path, path, idx: normpath(sep.join((path, '..', rel_path))) if isinstance(rel_path, str) else flattened[idx+rel_path][0]
    return {path: (node[0], [resolve_input(rel_path, path, idx) for rel_path in node[1]]) for idx, (path, node) in enumerate(flattened)}

def pipeline(net):
    return [(sep.join(path), (node if has_inputs(node) else (node, [-1]))) for (path, node) in path_iter(net)]

class Network(nn.Module):
    def __init__(self, net):
        super().__init__()
        self.graph = build_graph(net)
        for path, (val, _) in self.graph.items():
            setattr(self, path.replace('/', '_'), val)

    def nodes(self):
        return (node for node, _ in self.graph.values())

    def forward(self, inputs):
        outputs = dict(inputs)
        for k, (node, ins) in self.graph.items():
            #only compute nodes that are not supplied as inputs.
            if k not in outputs:
                outputs[k] = node(*[outputs[x] for x in ins])
        return outputs

    def half(self):
        for node in self.nodes():
            if isinstance(node, nn.Module) and not isinstance(node, nn.BatchNorm2d):
                node.half()
        return self

class Identity(namedtuple('Identity', [])):
    def __call__(self, x): return x

class Add(namedtuple('Add', [])):
    def __call__(self, x, y): return x + y

class AddWeighted(namedtuple('AddWeighted', ['wx', 'wy'])):
    def __call__(self, x, y): return self.wx*x + self.wy*y

class Mul(nn.Module):
    def __init__(self, weight):
        super().__init__()
        self.weight = weight
    def __call__(self, x):
        return x*self.weight

class Flatten(nn.Module):
    def forward(self, x): return x.view(x.size(0), x.size(1))

class Concat(nn.Module):
    def forward(self, *xs): return torch.cat(xs, 1)

class BatchNorm(nn.BatchNorm2d):
    def __init__(self, num_features, eps=1e-05, momentum=0.1, weight_freeze=False, bias_freeze=False, weight_init=1.0, bias_init=0.0):
        super().__init__(num_features, eps=eps, momentum=momentum)
        if weight_init is not None: self.weight.data.fill_(weight_init)
        if bias_init is not None: self.bias.data.fill_(bias_init)
        self.weight.requires_grad = not weight_freeze
        self.bias.requires_grad = not bias_freeze

def conv_bn(c_in, c_out):
    return {
        'conv': nn.Conv2d(c_in, c_out, kernel_size=3, stride=1, padding=1, bias=False),
        'bn': BatchNorm(c_out),
        'relu': nn.ReLU(True)
    }

def residual(c):
    return {
        'in': Identity(),
        'res1': conv_bn(c, c),
        'res2': conv_bn(c, c),
        'add': (Add(), ['in', 'res2/relu']),
    }

def simple_resnet(channels=None, weight=0.125, pool=nn.MaxPool2d(2), extra_layers=(), res_layers=('layer1', 'layer3')):
    channels = channels or {'prep': 64, 'layer1': 128, 'layer2': 256, 'layer3': 512}
    n = {
        'input': (None, []),
        'prep': conv_bn(3, channels['prep']),
        'layer1': dict(conv_bn(channels['prep'], channels['layer1']), pool=pool),
        'layer2': dict(conv_bn(channels['layer1'], channels['layer2']), pool=pool),
        'layer3': dict(conv_bn(channels['layer2'], channels['layer3']), pool=pool),
        'pool': nn.MaxPool2d(4),
        'flatten': Flatten(),
        'linear': nn.Linear(channels['layer3'], 10, bias=False),
        'logits': Mul(weight),
    }
    for layer in res_layers:
        n[layer]['residual'] = residual(channels[layer])
    for layer in extra_layers:
        n[layer]['extra'] = conv_bn(channels[layer], channels[layer])
    return n

## Losses, Optimizers

class CrossEntropyLoss(namedtuple('CrossEntropyLoss', [])):
    def __call__(self, log_probs, target):
        return torch.nn.functional.nll_loss(log_probs, target, reduction='none')

class KLLoss(namedtuple('KLLoss', [])):
    def __call__(self, log_probs):
        return -log_probs.mean(dim=1)

class Correct(namedtuple('Correct', [])):
    def __call__(self, classifier, target):
        return classifier.max(dim = 1)[1] == target

class LogSoftmax(namedtuple('LogSoftmax', ['dim'])):
    def __call__(self, x):
        return torch.nn.functional.log_softmax(x, self.dim, _stacklevel=5)

x_ent_loss = Network({
  'loss':  (nn.CrossEntropyLoss(reduction='none'), ['logits', 'target']),
  'acc': (Correct(), ['logits', 'target'])
})

label_smoothing_loss = lambda alpha: Network({
        'logprobs': (LogSoftmax(dim=1), ['logits']),
        'KL':  (KLLoss(), ['logprobs']),
        'xent':  (CrossEntropyLoss(), ['logprobs', 'target']),
        'loss': (AddWeighted(wx=1-alpha, wy=alpha), ['xent', 'KL']),
        'acc': (Correct(), ['logits', 'target']),
    })

trainable_params = lambda model: {k:p for k,p in model.named_parameters() if p.requires_grad}

def nesterov_update(w, dw, v, lr, weight_decay, momentum):
    dw.add_(weight_decay, w).mul_(-lr)
    v.mul_(momentum).add_(dw)
    w.add_(dw.add_(momentum, v))

norm = lambda x: torch.norm(x.reshape(x.size(0),-1).float(), dim=1)[:,None,None,None]

def LARS_update(w, dw, v, lr, weight_decay, momentum):
    nesterov_update(w, dw, v, lr*(norm(w)/(norm(dw)+1e-2)).to(w.dtype), weight_decay, momentum)

def zeros_like(weights):
    return [torch.zeros_like(w) for w in weights]

def optimiser(weights, param_schedule, update, state_init):
    weights = list(weights)
    return {'update': update, 'param_schedule': param_schedule, 'step_number': 0, 'weights': weights,  'opt_state': state_init(weights)}

def opt_step(update, param_schedule, step_number, weights, opt_state):
    step_number += 1
    param_values = {k: f(step_number) for k, f in param_schedule.items()}
    for w, v in zip(weights, opt_state):
        if w.requires_grad:
            update(w.data, w.grad.data, v, **param_values)
    return {'update': update, 'param_schedule': param_schedule, 'step_number': step_number, 'weights': weights,  'opt_state': opt_state}

LARS = partial(optimiser, update=LARS_update, state_init=zeros_like)
SGD = partial(optimiser, update=nesterov_update, state_init=zeros_like)


## Training Code

MODEL = 'model'
LOSS = 'loss'
VALID_MODEL = 'valid_model'
OPTS = 'optimisers'
OUTPUT = 'output'
ACT_LOG = 'activation_log'

def reduce(batches, state, steps):
    #state: is a dictionary
    #steps: are functions that take (batch, state)
    #and return a dictionary of updates to the state (or None)

    for batch in chain(batches, [None]):
    #we send an extra batch=None at the end for steps that
    #need to do some tidying-up (e.g. log_activations)
        for step in steps:
            updates = step(batch, state)
            if updates:
                for k,v in updates.items():
                    state[k] = v
    return state

def forward(training_mode):
    def step(batch, state):
        if not batch: return
        model = state[MODEL] if training_mode or (VALID_MODEL not in state) else state[VALID_MODEL]
        if model.training != training_mode: #without the guard it's slow!
            model.train(training_mode)
        return {OUTPUT: state[LOSS](model(batch))}
    return step

def backward(dtype=None):
    def step(batch, state):
        state[MODEL].zero_grad()
        if not batch: return
        loss = state[OUTPUT][LOSS]
        if dtype is not None:
            loss = loss.to(dtype)
        loss.sum().backward()
    return step

def opt_steps(batch, state):
    if not batch: return
    return {OPTS: [opt_step(**opt) for opt in state[OPTS]]}

def log_activations(node_names=('loss', 'acc')):
    def step(batch, state):
        if '_tmp_logs_' not in state:
            state['_tmp_logs_'] = []
        if batch:
            state['_tmp_logs_'].extend((k, state[OUTPUT][k].detach()) for k in node_names)
        else:
            res = {k: to_numpy(torch.cat(xs)).astype(np.float) for k, xs in group_by_key(state['_tmp_logs_']).items()}
            del state['_tmp_logs_']
            return {ACT_LOG: res}
    return step

epoch_stats = lambda state: {k: np.mean(v) for k, v in state[ACT_LOG].items()}

default_train_steps = (forward(training_mode=True), log_activations(('loss', 'acc')), backward(), opt_steps)
default_valid_steps = (forward(training_mode=False), log_activations(('loss', 'acc')))

def train_epoch(state, timer, train_batches, valid_batches, train_steps=default_train_steps, valid_steps=default_valid_steps,
                on_epoch_end=(lambda state: state)):
    train_summary, train_time = epoch_stats(on_epoch_end(reduce(train_batches, state, train_steps))), timer()
    valid_summary, valid_time = epoch_stats(reduce(valid_batches, state, valid_steps)), timer(include_in_total=False) #DAWNBench rules
    return {
        'train': union({'time': train_time}, train_summary),
        'valid': union({'time': valid_time}, valid_summary),
        'total time': timer.total_time
    }



