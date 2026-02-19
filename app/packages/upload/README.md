# @fiftyone/upload

File uploads with progress tracking, validation, drag-and-drop, and concurrent
upload management.

## Example

```tsx
import { useFileUpload } from "@fiftyone/upload";

function UploadForm() {
    const { files, dropProps, inputProps, browse, isUploading } =
        useFileUpload({
            multiple: true,
            autoUpload: { destination: "/uploads", endpoint: "/uploads" },
        });

    return (
        <div {...dropProps}>
            <input {...inputProps} />
            <button onClick={browse}>Select Files</button>

            {files.map((f) => (
                <div key={f.id}>
                    {f.name} - {f.status} ({f.progress}%)
                </div>
            ))}
        </div>
    );
}
```

Files begin uploading immediately after selection when `autoUpload` is
provided. To upload manually instead, omit `autoUpload` and call the returned
`upload(action)` function.

## API

### `useFileUpload(options?)`

Main hook that combines file management, upload handling, and UI helpers.

#### Options

| Option           | Type                                                       | Description                                         |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `multiple`       | `boolean`                                                  | Allow multiple file selection (default: `false`)    |
| `accept`         | `string[]`                                                 | Accepted file extensions (e.g., `[".png", ".jpg"]`) |
| `maxSize`        | `number`                                                   | Maximum file size in bytes                          |
| `maxSizeMessage` | `string`                                                   | Custom error message for size validation            |
| `validate`       | `(file: File) => string \| null`                           | Custom validation function                          |
| `transport`      | `UploadTransport`                                          | Custom upload transport                             |
| `maxConcurrent`  | `number`                                                   | Max concurrent uploads                              |
| `headers`        | `Record<string, string>` or `() => Record<string, string>` | Request headers                                     |
| `onFileSuccess`  | `(file: FileUploadItem) => void`                           | Success callback                                    |
| `onFileError`    | `(file: FileUploadItem, error: string) => void`            | Error callback                                      |
| `autoUpload`     | `UploadAction`                                             | Auto-upload files immediately on selection          |

#### Returns

| Property         | Type                                      | Description                   |
| ---------------- | ----------------------------------------- | ----------------------------- |
| `files`          | `FileUploadItem[]`                        | Current file list with status |
| `errors`         | `string[]`                                | Validation errors             |
| `addFiles`       | `(files: File[] \| FileList) => void`     | Add files to queue            |
| `removeFile`     | `(id: string) => void`                    | Remove a file                 |
| `clear`          | `() => void`                              | Clear all files               |
| `upload`         | `(action: UploadAction) => Promise<void>` | Start uploading               |
| `cancel`         | `(id: string) => void`                    | Cancel a single upload        |
| `cancelAll`      | `() => void`                              | Cancel all uploads            |
| `retry`          | `(id: string) => void`                    | Retry a failed upload         |
| `dropProps`      | `object`                                  | Props for drop zone element   |
| `inputProps`     | `object`                                  | Props for file input element  |
| `browse`         | `() => void`                              | Open file picker              |
| `totalFiles`     | `number`                                  | Total file count              |
| `completedFiles` | `number`                                  | Successful upload count       |
| `failedFiles`    | `number`                                  | Failed upload count           |
| `isUploading`    | `boolean`                                 | Upload in progress            |

### Types

```ts
type FileUploadStatus =
    | "selected"
    | "uploading"
    | "success"
    | "error"
    | "cancelled";

interface FileUploadItem {
    id: string;
    file: File;
    name: string;
    size: number;
    type: string;
    status: FileUploadStatus;
    progress: number;
    remotePath?: string;
    error?: string;
}

interface UploadAction {
    destination: string;
    resolvePath?: (destination: string, file: File) => string;
    endpoint?: string;
}
```

### Additional Exports

-   `useFileManager` - File state management only
-   `useUploadManager` - Upload logic only
-   `useFileDrop` - Drag-and-drop handling
-   `useFileInput` - File input handling
-   `createFetchTransport` / `createXhrTransport` - Transport factories

## Development

### Example App

Run the example app with a local upload server:

```bash
yarn example
```

This starts:

-   Frontend at http://localhost:3000
-   Upload server at http://localhost:3001

### Unit Tests

```bash
yarn test
```

### E2E Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run e2e tests
yarn test:e2e

# Run with UI
yarn test:e2e:ui
```

## License

Apache-2.0
