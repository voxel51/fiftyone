"""
Test options for efficiently generating `_rand` values for samples.
"""
import hashlib
import random
import struct

import eta.core.utils as etau


def generate_rand(filepath=None):
    if filepath is not None:
        random.seed(filepath)

    # return random.random() * 0.001 + 0.999
    return random.getrandbits(48)


def generate_hash(filepath=None):
    h = hashlib.blake2b()
    h.update(str(filepath).encode())
    bytes = h.digest()
    return abs(struct.unpack("i", bytes[:4])[0])


num_words = int(1e5)
word_length = 16

words = [
    "".join(
        [
            random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
            for _ in range(word_length)
        ]
    )
    for _ in range(num_words)
]

print("no seed")
random.seed(1)
with etau.Timer():
    rands = []
    for word in words:
        rands.append(generate_rand())

print("random.seed(filepath)")
random.seed(1)
with etau.Timer():
    rands = []
    for word in words:
        rands.append(generate_rand(word))

print("hashlib.blake2b")
random.seed(1)
with etau.Timer():
    h = hashlib.blake2b()
    rands = []
    for word in words:
        rands.append(generate_hash(word))
