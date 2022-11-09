# State

FiftyOne App state APIs

## Usage

This package can be used in the following contexts

- internal - for interacting with the app state within the core app modules
- external - for interacting with the state of an embeded app aka the `<Dataset />` component
- plugin - for interacting with app state in your plugin

## Types

The API assumes you are running in one of the contexts listed above, which requires the ability to interact with the following types of objects.

### Recoil

- `Atom`
- `Selector`
- `SelectorFamily`

### React Hooks

Custom hooks following similar patterns to the following:

- `useEffect`
- `useState`
- `useCallback`
- etc.

## API Reference

Coming soon. This will describe each of the exported objects and functions.
