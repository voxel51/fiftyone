# decoders

Decoders turn encoded bytes payloads into cloneable IR outputs. This namespace
owns the decoder contract, registration, and the normalization needed before
data can enter the shared runtime. A format adapter chooses which decoders
apply; the decoder itself should only understand its payload.

It's important to know that concerns like fetching bytes, scheduling playback,
and drawing pixels belong elsewhere. Keeping those concerns out makes decoding
deterministic and easy to move off the main thread.
