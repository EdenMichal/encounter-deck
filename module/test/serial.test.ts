import { describe, expect, it } from "vitest";
import { createQueue, sharedInFlight } from "../src/serial";

const tick = () => new Promise(r => setTimeout(r, 0));

describe("sharedInFlight", () => {
  it("runs once for calls made while it is running, and they all get its result", async () => {
    let runs = 0;
    const create = sharedInFlight(async () => { runs++; await tick(); return `folder ${runs}`; });
    const results = await Promise.all([create(), create(), create()]);
    expect(runs).toBe(1);
    expect(results).toEqual(["folder 1", "folder 1", "folder 1"]);
  });

  it("runs again once the last call has settled", async () => {
    let runs = 0;
    const create = sharedInFlight(async () => ++runs);
    await create();
    await create();
    expect(runs).toBe(2);
  });

  it("runs again after a failure", async () => {
    let runs = 0;
    const create = sharedInFlight(async () => { runs++; if (runs === 1) throw new Error("no"); return runs; });
    await expect(create()).rejects.toThrow("no");
    await expect(create()).resolves.toBe(2);
  });
});

describe("createQueue", () => {
  it("runs tasks one at a time, in order", async () => {
    const queue = createQueue();
    const log: string[] = [];
    const task = (name: string) => async () => { log.push(`${name} start`); await tick(); log.push(`${name} end`); return name; };
    const results = await Promise.all([queue(task("a")), queue(task("b"))]);
    expect(results).toEqual(["a", "b"]);
    expect(log).toEqual(["a start", "a end", "b start", "b end"]);
  });

  it("keeps going after a failed task, and its caller gets the error", async () => {
    const queue = createQueue();
    const failed = queue(async () => { throw new Error("boom"); });
    const next = queue(async () => "next");
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("next");
  });
});
