"""
VQA evaluation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import inspect
import itertools
import re

import numpy as np

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.validation as fov

from .base import (
    BaseEvaluationMethod,
    BaseEvaluationMethodConfig,
    BaseClassificationResults,
)


#
# The normalization pipeline below replicates the official VQAv2 evaluation
# code (https://github.com/GT-Vision-Lab/VQA, vqaEval.py) so that accuracies
# computed here match published VQAv2-family numbers, quirks included:
#
# -   `_PERIOD_STRIP` contains a malformed lookbehind `(?!<=\d)` (the authors
#     intended `(?<!\d)`); the trailing `(?!\d)` lookahead does the real work
# -   `re.UNICODE` is passed as the `count` argument to `sub()`
# -   the contractions map includes dead capitalized keys (input is
#     lowercased before lookup) and the reversed entry
#     `"somebody'd": "somebodyd"`
# -   punctuation removal conditions check the *original* input string on
#     every iteration, and a digit,digit match anywhere in the input causes
#     bare removal (no space) for *all* punctuation characters
#

# fmt: off
_CONTRACTIONS = {
    "aint": "ain't", "arent": "aren't", "cant": "can't",
    "couldve": "could've", "couldnt": "couldn't",
    "couldn'tve": "couldn't've", "couldnt've": "couldn't've",
    "didnt": "didn't", "doesnt": "doesn't", "dont": "don't",
    "hadnt": "hadn't", "hadnt've": "hadn't've", "hadn'tve": "hadn't've",
    "hasnt": "hasn't", "havent": "haven't", "hed": "he'd",
    "hed've": "he'd've", "he'dve": "he'd've", "hes": "he's",
    "howd": "how'd", "howll": "how'll", "hows": "how's",
    "Id've": "I'd've", "I'dve": "I'd've", "Im": "I'm", "Ive": "I've",
    "isnt": "isn't", "itd": "it'd", "itd've": "it'd've",
    "it'dve": "it'd've", "itll": "it'll", "let's": "let's",
    "maam": "ma'am", "mightnt": "mightn't", "mightnt've": "mightn't've",
    "mightn'tve": "mightn't've", "mightve": "might've",
    "mustnt": "mustn't", "mustve": "must've", "neednt": "needn't",
    "notve": "not've", "oclock": "o'clock", "oughtnt": "oughtn't",
    "ow's'at": "'ow's'at", "'ows'at": "'ow's'at", "'ow'sat": "'ow's'at",
    "shant": "shan't", "shed've": "she'd've", "she'dve": "she'd've",
    "she's": "she's", "shouldve": "should've", "shouldnt": "shouldn't",
    "shouldnt've": "shouldn't've", "shouldn'tve": "shouldn't've",
    "somebody'd": "somebodyd", "somebodyd've": "somebody'd've",
    "somebody'dve": "somebody'd've", "somebodyll": "somebody'll",
    "somebodys": "somebody's", "someoned": "someone'd",
    "someoned've": "someone'd've", "someone'dve": "someone'd've",
    "someonell": "someone'll", "someones": "someone's",
    "somethingd": "something'd", "somethingd've": "something'd've",
    "something'dve": "something'd've", "somethingll": "something'll",
    "thats": "that's", "thered": "there'd", "thered've": "there'd've",
    "there'dve": "there'd've", "therere": "there're", "theres": "there's",
    "theyd": "they'd", "theyd've": "they'd've", "they'dve": "they'd've",
    "theyll": "they'll", "theyre": "they're", "theyve": "they've",
    "twas": "'twas", "wasnt": "wasn't", "wed've": "we'd've",
    "we'dve": "we'd've", "weve": "we've", "werent": "weren't",
    "whatll": "what'll", "whatre": "what're", "whats": "what's",
    "whatve": "what've", "whens": "when's", "whered": "where'd",
    "wheres": "where's", "whereve": "where've", "whod": "who'd",
    "whod've": "who'd've", "who'dve": "who'd've", "wholl": "who'll",
    "whos": "who's", "whove": "who've", "whyll": "why'll",
    "whyre": "why're", "whys": "why's", "wont": "won't",
    "wouldve": "would've", "wouldnt": "wouldn't",
    "wouldnt've": "wouldn't've", "wouldn'tve": "wouldn't've",
    "yall": "y'all", "yall'll": "y'all'll", "y'allll": "y'all'll",
    "yall'd've": "y'all'd've", "y'alld've": "y'all'd've",
    "y'all'dve": "y'all'd've", "youd": "you'd", "youd've": "you'd've",
    "you'dve": "you'd've", "youll": "you'll", "youre": "you're",
    "youve": "you've",
}
_MANUAL_MAP = {
    "none": "0", "zero": "0", "one": "1", "two": "2", "three": "3",
    "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8",
    "nine": "9", "ten": "10",
}
_PUNCT = [
    ";", r"/", "[", "]", '"', "{", "}", "(", ")", "=", "+", "\\", "_",
    "-", ">", "<", "@", "`", ",", "?", "!",
]
# fmt: on

_ARTICLES = ["a", "an", "the"]
_PERIOD_STRIP = re.compile(r"(?!<=\d)(\.)(?!\d)")
_COMMA_STRIP = re.compile(r"(\d)(\,)(\d)")


def _process_punctuation(in_text):
    out_text = in_text
    for p in _PUNCT:
        if (p + " " in in_text or " " + p in in_text) or (
            re.search(_COMMA_STRIP, in_text) != None
        ):
            out_text = out_text.replace(p, "")
        else:
            out_text = out_text.replace(p, " ")

    out_text = _PERIOD_STRIP.sub("", out_text, re.UNICODE)
    return out_text


def _process_digit_article(in_text):
    out_text = []
    for word in in_text.lower().split():
        word = _MANUAL_MAP.get(word, word)
        if word not in _ARTICLES:
            out_text.append(word)

    for i, word in enumerate(out_text):
        if word in _CONTRACTIONS:
            out_text[i] = _CONTRACTIONS[word]

    return " ".join(out_text)


def _strip_answer(answer):
    return answer.replace("\n", " ").replace("\t", " ").strip()


def _normalize_answer(answer):
    return _process_digit_article(_process_punctuation(_strip_answer(answer)))
