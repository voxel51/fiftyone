import { createContext } from "react";
import type { SubsetPage } from "@fiftyone/state/src/selection";

interface CachedPage {
  expires: number;
  value?: SubsetPage;
  pending: Promise<SubsetPage>;
}

/** Short-lived metadata pages, shared by the workspace's subset pickers. */
export class SubsetPages {
  private readonly pages = new Map<string, CachedPage>();

  peek(key: string) {
    const page = this.pages.get(key);
    return page && page.expires > Date.now() ? page.value : undefined;
  }

  get(key: string, load: () => Promise<SubsetPage>, force = false) {
    const previous = this.pages.get(key);
    if (!force && previous && previous.expires > Date.now())
      return previous.pending;
    const page: CachedPage = {
      expires: Date.now() + 30_000,
      pending: load(),
    };
    this.pages.delete(key);
    this.pages.set(key, page);
    if (this.pages.size > 32) this.pages.delete(this.pages.keys().next().value);
    page.pending.then(
      (value) => {
        page.value = value;
      },
      () => {
        if (this.pages.get(key) === page) this.pages.delete(key);
      },
    );
    return page.pending;
  }
}

export const SubsetPagesContext = createContext<SubsetPages | null>(null);
