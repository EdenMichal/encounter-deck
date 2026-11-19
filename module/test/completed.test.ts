import { describe, expect, it } from "vitest";
import { moveAfterStatus } from "../src/completed";

describe("moveAfterStatus", () => {
  const loose = { inCompletedFolder: false, inCampaign: true };
  const filed = { inCompletedFolder: true, inCampaign: true };

  it("files a newly Completed Encounter", () => expect(moveAfterStatus("completed", loose)).toBe("file"));
  it("leaves one already in the Completed folder", () => expect(moveAfterStatus("completed", filed)).toBeNull());
  it("returns one marked Ready or Draft again", () => {
    expect(moveAfterStatus("ready", filed)).toBe("return");
    expect(moveAfterStatus("draft", filed)).toBe("return");
  });
  it("leaves a Ready or Draft one where it is", () => expect(moveAfterStatus("ready", loose)).toBeNull());
  it("never moves anything outside a Campaign (the Shared Library)", () =>
    expect(moveAfterStatus("completed", { inCompletedFolder: false, inCampaign: false })).toBeNull());
});
