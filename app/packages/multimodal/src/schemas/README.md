# schemas

Schemas are generated transport contracts. They describe serialized messages at
source boundaries but are not application models and do not carry runtime
behavior.

Adapters translate schema values into IR once. Views, runtime, query, decoders,
and visualization consume IR instead. Generated schemas may depend on their
serialization runtime, but never on another multimodal namespace.
