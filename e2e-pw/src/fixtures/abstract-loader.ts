import { Page } from "@playwright/test";

export abstract class DatasetLocator {
  abstract visit(path: string): Page;
}

export abstract class AbstractFiftyoneLoader {
  abstract loadZooDataset(
    name: string,
    kwargs: Record<string, string>
  ): Promise<void>;

  abstract loadTestDataset(name: string): Promise<void>;

  abstract executePythonCode(code: string): Promise<void>;

  abstract executePythonFixture(fixturePath: string): Promise<void>;

  abstract waitUntilLoad(page: Page, datasetName: string): Promise<void>;
}
