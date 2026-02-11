# @fiftyone/upload

File uploads with progress tracking, validation, drag-and-drop, and concurrent
upload management.

## Example

```tsx
import { useFileUpload } from "@fiftyone/upload";

function UploadForm() {
    const {
        files,
        addFiles,
        upload,
        dropProps,
        inputProps,
        browse,
        isUploading,
    } = useFileUpload({ multiple: true });

    return (
        <div {...dropProps}>
            <input {...inputProps} />
            <button onClick={browse}>Select Files</button>
            <button onClick={() => upload({ destination: "/uploads" })}>
                Upload
            </button>

            {files.map((f) => (
                <div key={f.id}>
                    {f.name} - {f.status} ({f.progress}%)
                </div>
            ))}
        </div>
    );
}
```

## API

### `useFileUpload(options?)`

Main hook that combines file management, upload handling, and UI helpers.

#### Options

| Option           | Type                                                       | Description                                         |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------- | -------------------------- |
| `multiple`       | `boolean`                                                  | Allow multiple file selection (default: `false`)    |
| `accept`         | `string[]`                                                 | Accepted file extensions (e.g., `[".png", ".jpg"]`) |
| `maxSize`        | `number`                                                   | Maximum file size in bytes                          |
| `maxSizeMessage` | `string`                                                   | Custom error message for size validation            |
| `validate`       | `(file: File) => string                                    | null`                                               | Custom validation function |
| `transport`      | `UploadTransport`                                          | Custom upload transport                             |
| `maxConcurrent`  | `number`                                                   | Max concurrent uploads                              |
| `headers`        | `Record<string, string>` or `() => Record<string, string>` | Request headers                                     |
| `onFileSuccess`  | `(file: FileUploadItem) => void`                           | Success callback                                    |
| `onFileError`    | `(file: FileUploadItem, error: string) => void`            | Error callback                                      |

#### Returns

| Property         | Type                                      | Description                   |
| ---------------- | ----------------------------------------- | ----------------------------- | ------------------ |
| `files`          | `FileUploadItem[]`                        | Current file list with status |
| `errors`         | `string[]`                                | Validation errors             |
| `addFiles`       | `(files: File[]                           | FileList) => void`            | Add files to queue |
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

## Running Tests

```bash
# From the package directory
yarn test

# Or from the app root
yarn test --filter=@fiftyone/upload
```
