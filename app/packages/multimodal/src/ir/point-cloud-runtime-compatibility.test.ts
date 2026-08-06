import { describe, expect, it } from "vitest";

import * as channelCompatibility from "./point-cloud-channel-encoding";
import * as payloadCompatibility from "./point-cloud-render-payload";
import * as channelRuntime from "../runtime/point-cloud-channel-encoding";
import * as payloadRuntime from "../runtime/point-cloud-render-payload";

describe("point-cloud runtime compatibility", () => {
  it("keeps the IR channel-policy facade wired to the runtime owner", () => {
    expect(channelCompatibility).toEqual(channelRuntime);
  });

  it("keeps the IR payload-policy facade wired to the runtime owner", () => {
    expect(payloadCompatibility).toEqual(payloadRuntime);
  });
});
