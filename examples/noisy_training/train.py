"""
Trains a clean model using the simple_resnet code and uses the global namespace
so everything is available during the next steps in the walkthrough.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from __future__ import print_function
from functools import partial
import json
import os
import random
import scipy.misc as spm
import sys
import time

from simple_resnet import *


# Settings; defaults are fine if you have a GPU.  Otherwise, you'll want to
# reduce some values just to get the gist of the walkthrough
settings = {}
# These settings are for a powerful GPU with more than 6GBs Memory
#settings['batch_size'] = 512
#settings['take'] = None
# These will work on GPU's with 4GB RAM
# You may need to lower further to run the walkthrough
settings['batch_size'] = 36
settings['take'] = 10000
# 24 gets us to a good point in this setup
settings['epochs'] = 24
# Where to save the model
settings['model_path'] = './model.pth'
# Should not need to change these
settings['n_rounds'] = 1
settings['p_initial'] = 1.0

localtime = lambda: time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())

class Config:
    '''A configuration for the training.'''

    def __init__(self, d):
        '''d is a dictionary of arguments from command-line.'''

        self.batch_size = d["batch_size"]
        self.epochs = d["epochs"]
        self.model_path = d["model_path"]
        self.n_rounds = d["n_rounds"]
        self.p_initial = d["p_initial"]
        self.take = d["take"]

    def __str__(self):
        return str(vars(self))


config = Config(settings)


##  Dataset Setup
cifar10_mean, cifar10_std = [
    (125.31, 122.95, 113.87), # equals np.mean(cifar10()['train']['data'], axis=(0,1,2))
    (62.99, 62.09, 66.70), # equals np.std(cifar10()['train']['data'], axis=(0,1,2))
]

cifar10_map = "airplane, automobile, bird, cat, deer, dog, frog, horse, ship, truck".split(', ')
cifar10_rev = {name: index for index, name in enumerate(cifar10_map)}
N_labels = 10

class DataLoader():
    def __init__(self, dataset, batch_size, shuffle, set_random_choices=False, num_workers=0, drop_last=False):
        self.dataset = dataset
        self.batch_size = batch_size
        self.set_random_choices = set_random_choices
        self.dataloader = torch.utils.data.DataLoader(
            dataset, batch_size=batch_size, num_workers=num_workers, pin_memory=True, shuffle=shuffle, drop_last=drop_last
        )

    def __iter__(self):
        if self.set_random_choices:
            self.dataset.set_random_choices()
        return ({'input': x.to(device).half(), 'target': y.to(device).long()} for (x,y) in self.dataloader)

    def __len__(self):
        return len(self.dataloader)

## Initial Data Input
# We are going to cache the data in memory to make model training faster.
# Let's get the data from the already create FiftyOne datasets from the
# previous step in the walkthrough.

# Produces train_set and valid_set that are lists of tuples: (image, label)
timer = Timer()
# remove
#whole_dataset = cifar10(root=DATA_DIR)
#

if train_dataset is None:
    raise ValueError(
        "train expects 'train_dataset' in the global namespace. See README.md"
    )
if valid_dataset is None:
    raise ValueError(
        "train expects 'valid_dataset' in the global namespace. See README.md"
    )

def update_progress(progress):
    # progress is [0,1]
    t = 51
    i = int(progress*t)
    r = t-i
    print("\r[%s%s] %.1f%%" % ("#"*i, " "*r,  progress*100), end="")

print("Caching the data in memory to support faster training.")
print("Training images")
_train_images = []
_train_labels = []
for index, sample in enumerate(train_dataset.default_view().iter_samples()):
    image = np.array(spm.imread(sample.filepath))
    label = cifar10_rev[sample.get_label("ground_truth").label]
    _train_images.append(image)
    _train_labels.append(label)

    if index % 100 == 0:
        update_progress(index / len(train_dataset))
update_progress(1)
print()

print("Validation images")
_valid_images = []
_valid_labels = []
for index, sample in enumerate(valid_dataset.default_view().iter_samples()):
    image = np.array(spm.imread(sample.filepath))
    label = cifar10_rev[sample.get_label("ground_truth").label]
    _valid_images.append(image)
    _valid_labels.append(label)

    if index % 100 == 0:
        update_progress(index / len(train_dataset))
update_progress(1)
print()

whole_dataset = {
    'train': {
        'data': np.asarray(_train_images),
        'targets': np.asarray(_train_labels)
    },
    'valid': {
        'data': np.asarray(_valid_images),
        'targets': np.asarray(_valid_labels)
    }
}

print("Preprocessing training data")
transforms = [
    partial(normalise, mean=np.array(cifar10_mean, dtype=np.float32), std=np.array(cifar10_std, dtype=np.float32)),
    partial(transpose, source='NHWC', target='NCHW'),
]
whole_train_set = list(zip(*preprocess(whole_dataset['train'], [partial(pad, border=4)] + transforms).values()))
valid_set = list(zip(*preprocess(whole_dataset['valid'], transforms).values()))
print(f"Finished loading and preprocessing in {timer():.2f} seconds")

print(f"train set: {len(whole_train_set)} samples")
print(f"valid set: {len(valid_set)} samples")

if config.take:
    whole_train_set = whole_train_set[:config.take]
    valid_set = whole_train_set[:config.take]
    print(f"using a subset of the data for the model training")
    print(f"train set: {len(whole_train_set)} samples")
    print(f"valid set: {len(valid_set)} samples")

# set up the variables for training the model in each increment of the dataset size
lr_schedule = PiecewiseLinear([0, 5, config.epochs], [0, 0.4, 0])
train_transforms = [Crop(32, 32), FlipLR(), Cutout(8, 8)]

# compute the derived parameters for the trial based on the dataset and the
# provided config.
total_N = len(whole_train_set)

start_N = round(config.p_initial * total_N)

incr_N = ( 0 if config.n_rounds == 1 else
    round((total_N-start_N) / (config.n_rounds-1))
)

corrupt_N = round(config.p_corrupt * total_N)

print(f'Setting up the experiment: {total_N} training samples.')
print(f'- starting with {start_N}')
print(f'- incrementing by {incr_N} for each of {config.n_rounds-1} rounds')
print(f'- total rounds: {config.n_rounds}')

print(f'Starting the model training at {localtime()}')

inuse_N = start_N

model = Network(simple_resnet()).to(device).half()
logs, state = Table(), {MODEL: model, LOSS: x_ent_loss}

valid_batches = DataLoader(valid_set, config.batch_size, shuffle=False, drop_last=False)

# initially randomly shuffle the dataset and take the initial number of samples
whole_train_set_use = whole_train_set[0:inuse_N]
whole_train_set_avail = whole_train_set[inuse_N:]
print(f'Split training set into two; using {len(whole_train_set_use)}, available {len(whole_train_set_avail)}')

sm = torch.nn.Softmax(dim=1)

stats = {}

for iteration in range(config.n_rounds):
    print(f'beginning next round of training, using {inuse_N} samples')

    if config.cold_start:
        model = Network(simple_resnet()).to(device).half()
        logs, state = Table(), {MODEL: model, LOSS: x_ent_loss}

    train_batches = DataLoader(
            Transform(whole_train_set_use, train_transforms),
            config.batch_size, shuffle=True, set_random_choices=True, drop_last=True
    )
    lr = lambda step: lr_schedule(step/len(train_batches))/config.batch_size
    opts = [
        SGD(trainable_params(model).values(),
        {'lr': lr, 'weight_decay': Const(5e-4*config.batch_size), 'momentum': Const(0.9)})
    ]
    state[OPTS] = opts

    for epoch in range(config.epochs):
        logs.append(union({'epoch': epoch+1}, train_epoch(state, Timer(torch.cuda.synchronize), train_batches, valid_batches)))
    logs.df().query(f'epoch=={config.epochs}')[['train_acc', 'valid_acc']].describe()

    model.train(False) # == model.eval()

    # record scores for this iteration
    iteration_stats = {}
    iteration_stats["in_use"] = inuse_N

    correct = 0
    total = 0
    class_correct = list(0. for i in range(10))
    class_total = list(0. for i in range(10))
    with torch.no_grad():
        for data in valid_batches.dataloader:
            images, labels = data
            inputs = dict(input=images.cuda().half())
            outputs = model(inputs)
            y = outputs['logits']
            _, predicted = torch.max(y, 1)
            total += labels.size(0)
            labels_gpu = labels.cuda().half()
            correct += (predicted == labels_gpu).sum().item()
            c = (predicted == labels_gpu).squeeze()
            for i in range(min(config.batch_size, len(labels))):
                label = labels[i]
                class_correct[label] += c[i].item()
                class_total[label] += 1

    iteration_stats["validation_accuracy"] = correct / total

    model.train(True)

    # extend the corr_train_set_use with that from avail
    whole_train_set_use.extend(whole_train_set_avail[0:incr_N])
    whole_train_set_avail = whole_train_set_avail[incr_N:]
    inuse_N += incr_N
    assert inuse_N == len(whole_train_set_use)

    stats[inuse_N] = iteration_stats

print(f'finished the full training; stats to follow')
print(stats)

if config.model_path:
    torch.save(model.state_dict(),config.model_path)
