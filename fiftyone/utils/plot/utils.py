"""
Plotting utils.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import numpy as np

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau


# Original images from https://www.iconfinder.com
BUTTON_ICONS = {
    "map": "eJztk79LG2Ech9+jcgdddFKaLDcYTiWNuCTQVeymyWCGTiXEJEdbGklMl7aT4FKERAeJk/4Dpd1bx3avm0bQrFl00Io/+nr33q/3vfu+74VS6PI+w4V88+QZPiHbS8XFwgsFvUPvjZVKs9wwnunGh9ackdaNar2x1ii9fVlvrFTs+/PSm2bFujfN0mrFej+Vy6b1XHY6rX/U/5LHSCL5LxQ3ng7lZQoTMUbqBGN8+iS2lPqK8eWCyBjbvMM2v9vi2tjmja0d8Y0Rc4A9rjuJITyuMn+Iabg1yuOU7AFCgDXGA0vuALG1kCccAF+R5xlcowfltIIB7rtl8qpWqdpWEvBegS1qgINZtOw6aq0fqsEeZ4BeXkGUw9ZmuJ6HUvUHuGhq9oV26BoWeA7r/gA7486FdbRwjePZnLvKN//vHHbYGt9DyDGOlxTEdzTTq4k9cvihUhfo99FMctwTe+SwjITOsJ5syZZsyZZsyZZsyRZB3ScnU4tpqT/jWkr+GDv02RrP4zuZ7ziAqXG8c15rvHuPGfo1NcZbh1ta6wJH8GugN6gqUEsp9Dzj5tPM1rVfO3NqoDeKENCaPfC//GXSOifDNY4Xbb3e/eMZv+bdDxIdpkZey4AXbvkMao+Cj5gaeV6BHtiKDEDXRF60FR0ArkEe24IGgGo8L2jBA7i1dlATeehINEC4div2Fi6tAVLCEql9tlK9OG+ikIkt2aQ3ikN5Esk/5wFTASSi",
    "sync": "eJztll9IU1Ecx28u7zWVCp1BS2tPbtP1UISDIIIeon8zJ/2hBwnJifRHZTezKImQ2V5FEgwpIoIKzTR76yGSWAZFT6EvZS77o840N/8s9XbVc86uu+fcc67tKfZ92u73y+ee39nvd86aCo87i06t4S5xVy1lbvGMx7LbbLlWs8NiN1vKqzwXPaWVp6s8Ze7F5/tLz4tu+blYUVrtlr9bHQV2s6PAZjfXmVepVC6hhBKKkcEhtvYMBCML4UDv/Zo9PDLyusOhLis7iC9un5BWKPTkpLCMWjLGWWFGb1DCKNiwSTa7l790MpHSfGEcaVFhbzoHzEkWlCtAIi0q4ISf6KSU21okpaio7A+sKCrL+oUZRWNZh5Xheb/XlZ/BJ623FTX0LuhkZStXNVhrUno5dd/1sFIUezVSnqyyxXF2Vks09yADF9j8nJXlQqmIW2XKM6hjv9JRi4YPqlETsSRNlg+t6oDa7FajNFhZqAZ1gRyHG1Ayy4u2HeeG1CjybPPwkBnG/oJdalYHkVUMI+VY2zoeixrLJbLaQWRQ1aIA1jm5osAOMmrtbxCqJUaY5QCoeRM9S5MIWP5/R3GtgOWNA6sHsFxxYA0AVn4cWLBTsY2qUxHA4unR+LN2vpgOP8vDWnprtC1NwYQN5+ndezBybTgP9kQxG0qYBgOOM2GvNrCx9oH4DM70APMNG6sJxPtxJprtLSwoHl7v93CuAd4zl1lYJfAYO4G124AbYOiwpI/wREzH+uiiraCz3DDbivf5UeCPZtJQWXC3FuyERD182UMaC26H9JSUyERXIKXKKpibIw8Jumz/HNZCOedgrpkcSkV/5KY0YIemYGpoo8YbCyW0srOkTFkEhY5orZ5rRjnpkREX2HA3mmjURHHC+2g0eE6ItQ0l36L+a8L9jmT6HA1LQ1dylF7mhT6F2ZdFQXFc7k9FXpp/e/PYdqMgGG2u668iSiewlYqSYcqVEdW/jQEll/mOjuqlF7gs4RYN1ajj4nMOaJG+HmUnyUqtnySRZn1pulCyMm6M4EhjPqYjPFbJhY9/rQSF2kt0rwnJsKu65eWnkdmZH/3+O5V7160alFBC/63+Asl9Dog=",
    "disconnect": "eJztmG9IE2Ecx28ribQ/qGQUledGTHFSYWpYRilYUYqCRoYh1i6tLG2rREosaC8Mk2gQlI2cK6NQ8nUJ0ZtSiBaCEigpkdpfnTqkctu16e+5u9nzPHc4e7fvu/t+v8/n7rk9z90xS25hTl6RirnEXNYZONMJoy6d1V25uE2nZ3UnK40XjKXnSiqNBs7vZ5dWmDifbyovreJ8x/FpqXo2LTVBz9ayC1Q4E1JIIf1vxZjs9vNrFgV1dIr3afLwIqAOeflZebKDRqk/8qAPqmBZKbygLcGyCkVWXrCsIyKrYAHDUzumXG0aMkvb7ppxHFSEOubxD/wWR2Jpv8/+rEUKUAfccyOfkljtc0d/smRRm50wcorEcsHhWJwMKuwdGumUY/HdS+msq8LIFhLrmWDUUFGaX6g3up7ESvYgY3ojjfUY1b4mMCQWwwmOjYKKR6ecTkYWbq3WI8etwXP8uoNKnGDh9tCSN8i6RUSFT0DluehtF1lJgpk4A9bPZSQWugZPouipBxCqT9K8h8wcEssOhTapuQ/uoTtTYmrRjb1PYo1AITPALZyd+Xh+gNkJ1SECKhbyUXWgH11htZ6JCvTK0CTX4Vm5EDeTrlsiLWLtx+cmiMsUsJgfUD6Ljxsh3qWE9RrK9fjYBjGrhNUG5SZ8/ATiaCWsB1B+iI9bIY5RwkJrkbC970JM2bCiOqBswcc3IN6thPUWymZ8fBpigwKUaoJezoLYqoClR2s1A5/HQDyogFUJXW8kodALhR3yrC6oOkgFCxSIDxJBwhQbSI09UPi9QY71CLHSSQ3VEDRaZFAp6FHYT+7UotPRvxXC0OLiq8mlyEnojFD30U2EGltJaZlRqzuCXBLftXW0M674jGovV5E6JW7UGVxOYzEFwjkd+E8idZ3Q4HOpKIZpEZrOYkzMvhBRssswok8sv5q/2aKvT4tpD32Gfmm+iHW+69RaIQjba3VJouFNsiiG2erkpeq115YXH6+63ekKsMeT5El+2Cgvq2FlKN80e+VQPbEKUb6Pp2Y6qkn+tkuU/4lMGpJbV/MVcc2JJ43VLeD/pNU1A/+S+quJe0tGOxvfe0WO19FAfPQpUlQGZ7bYbBazIYP0mggppJAWSX8Bi5hqdQ==",
}


def load_button_icon(name):
    """Loads the button icon with the given name.

    The available buttons are :const:`BUTTON_ICONS`.

    Args:
        name: the button name

    Returns:
        the numpy image
    """
    return load_icon(BUTTON_ICONS[name])


def load_icon(icon_bytes):
    """Loads the icon image from bytes.

    Args:
        icon_bytes:

    Returns:
        the numpy image
    """
    alpha = etas.deserialize_numpy_array(icon_bytes)
    h, w = alpha.shape
    img = np.zeros((h, w, 4), dtype=alpha.dtype)
    img[:, :, -1] = alpha
    return img


def serialize_icon(img):
    """Serializes the icon image into a compressed bytes representation.

    The icon must be defined purely by alpha-channel values.

    Args:
        img: a numpy image

    Returns:
        a bytes string
    """
    if img.shape[2] < 4 or np.any(img[:, :, :-1] > 0):
        raise ValueError("Image must be alpha-only")

    alpha = img[:, :, -1]
    return etas.serialize_numpy_array(alpha)


def pad_icon(img, pad, fill=0):
    """Pads the icon by the

    Args:
        img: a numpy image
        pad: the number of pixels of padding
        fill (0): the fill value

    Returns:
         a numpy image
    """
    h, w, c = img.shape[:3]
    img_pad = np.full((h + 2 * pad, w + 2 * pad, c), fill, dtype=img.dtype)
    img_pad[pad : (pad + h), pad : (pad + w), :] = img
    return img_pad
