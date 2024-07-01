# FiftyOne Analytics

FiftyOne Analytics package.

## Configuring Analytics

```typescript
const [info, setInfo] = useAnalyticsInfo();

setInfo({
    writeKey: "<segment_write_key>",
    userId: "123",
    userGroup: "group1",
    doNotTrack: false,
});
```

## Tracking Events from React

```typescript
function MyComponent() {
    const trackEvent = useTrackEvent();

    useEffect(() => {
        trackEvent("my_component_loaded", { customProp: 42 });
    }, []);
}
```
