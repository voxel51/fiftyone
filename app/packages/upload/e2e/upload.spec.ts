import { test, expect } from "@playwright/test";
import path from "path";

const TEST_FILE = path.join(__dirname, "fixtures", "test-file.txt");
const TEST_FILE_2 = path.join(__dirname, "fixtures", "test-file-2.txt");
const LARGE_FILE = path.join(__dirname, "fixtures", "large-file.bin");

test.describe("File Upload", () => {
  test.beforeEach(async ({ request }) => {
    await request.delete("http://localhost:3001/api/files");
  });

  test("displays drop zone initially with no file list", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("drop-zone")).toBeVisible();
    await expect(page.getByTestId("file-list")).not.toBeVisible();
  });

  test("has a destination input defaulting to /my/upload/dir", async ({
    page,
  }) => {
    await page.goto("/");

    const input = page.getByTestId("destination-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("/my/upload/dir");
  });

  test("auto-uploads file on selection and verifies on server", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);

    // File should appear in the list
    await expect(page.getByTestId("file-item-test-file.txt")).toBeVisible();

    // Wait for upload to complete — remove button title changes to "Delete from server"
    await expect(page.getByTestId("remove-test-file.txt")).toHaveAttribute(
      "title",
      "Delete from server",
      { timeout: 10000 }
    );

    // Verify file arrived on the server
    const response = await request.get("http://localhost:3001/api/files");
    const files = await response.json();
    expect(files.length).toBe(1);
    expect(files[0].name).toContain("test-file.txt");
  });

  test("hides drop zone after files are added", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);

    await expect(page.getByTestId("drop-zone")).not.toBeVisible();
    await expect(page.getByTestId("add-more-button")).toBeVisible();
  });

  test("shows drop zone again via Add More Files button", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);
    await expect(page.getByTestId("drop-zone")).not.toBeVisible();

    await page.getByTestId("add-more-button").click();
    await expect(page.getByTestId("drop-zone")).toBeVisible();
  });

  test("removes file from list", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);
    await expect(page.getByTestId("file-item-test-file.txt")).toBeVisible();

    await page.getByTestId("remove-test-file.txt").click();

    await expect(page.getByTestId("file-item-test-file.txt")).not.toBeVisible();
  });

  test("deletes uploaded file from server on remove", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);

    // Wait for upload to complete
    await expect(page.getByTestId("remove-test-file.txt")).toHaveAttribute(
      "title",
      "Delete from server",
      { timeout: 10000 }
    );

    // Verify on server
    let response = await request.get("http://localhost:3001/api/files");
    let files = await response.json();
    expect(files.length).toBe(1);

    // Click remove (trash icon) — triggers server deletion
    await page.getByTestId("remove-test-file.txt").click();

    // File should disappear from list
    await expect(page.getByTestId("file-item-test-file.txt")).not.toBeVisible({
      timeout: 10000,
    });

    // Verify deleted from server
    response = await request.get("http://localhost:3001/api/files");
    files = await response.json();
    expect(files.length).toBe(0);
  });

  test("clears all files", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);
    await expect(page.getByTestId("file-list")).toBeVisible();

    await page.getByTestId("clear-button").click();

    await expect(page.getByTestId("file-list")).not.toBeVisible();
    await expect(page.getByTestId("drop-zone")).toBeVisible();
  });

  test("shows total progress bar during upload", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);

    // Progress bar should appear while uploading or after completion
    await expect(page.getByTestId("total-progress")).toBeVisible({
      timeout: 10000,
    });
  });

  test("validates file size and shows error", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(LARGE_FILE);

    await expect(page.getByTestId("error-list")).toBeVisible();
    await expect(page.getByTestId("error-list")).toContainText("10MB");
  });
});

test.describe("Multiple Files", () => {
  test.beforeEach(async ({ request }) => {
    await request.delete("http://localhost:3001/api/files");
  });

  test("auto-uploads multiple files", async ({ page, request }) => {
    await page.goto("/");

    await page
      .getByTestId("file-input")
      .setInputFiles([TEST_FILE, TEST_FILE_2]);

    await expect(page.getByTestId("file-item-test-file.txt")).toBeVisible();
    await expect(page.getByTestId("file-item-test-file-2.txt")).toBeVisible();

    // Wait for both to complete
    await expect(page.getByTestId("remove-test-file.txt")).toHaveAttribute(
      "title",
      "Delete from server",
      { timeout: 10000 }
    );
    await expect(page.getByTestId("remove-test-file-2.txt")).toHaveAttribute(
      "title",
      "Delete from server",
      { timeout: 10000 }
    );

    // Verify both files on server
    const response = await request.get("http://localhost:3001/api/files");
    const files = await response.json();
    expect(files.length).toBe(2);
  });

  test("can add more files after initial selection", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("file-input").setInputFiles(TEST_FILE);
    await expect(page.getByTestId("file-item-test-file.txt")).toBeVisible();

    // Open the drop zone again and add another file
    await page.getByTestId("add-more-button").click();
    await page.getByTestId("file-input").setInputFiles(TEST_FILE_2);

    await expect(page.getByTestId("file-item-test-file-2.txt")).toBeVisible();
  });
});
