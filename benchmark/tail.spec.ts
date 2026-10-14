import { expect, it } from "vitest";
import { redactErrorEvent } from "./tail";

it("never persists benchmark credentials or business payloads in error traces", () => {
  const event = { event: { request: { headers: { authorization: "secret", "x-benchmark-token": "secret" },
    url: "https://benchmark.invalid/auth?token=secret" } },
    logs: [{ level: "error", message: ["secret"], timestamp: 1 }],
    exceptions: [{ name: "Error", message: "secret", timestamp: 1 }], cpuTime: 5,
    wallTime: 10, outcome: "exception" } as unknown as TraceItem;
  const redacted = redactErrorEvent(event);
  expect(JSON.stringify(redacted)).not.toContain("secret");
  expect(redacted.cpuTime).toBe(5); expect(redacted.outcome).toBe("exception");
});
