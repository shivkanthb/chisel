import { describe, it, expect } from "vitest";
import { redactConnection } from "./engine";

describe("redactConnection", () => {
  it("strips credentials from a url connection", () => {
    expect(
      redactConnection({
        url: "redis://default:secret@redis.railway.internal:6379",
      })
    ).toEqual({ host: "redis.railway.internal", port: 6379 });
  });

  it("ignores query params and defaults the port", () => {
    expect(
      redactConnection({ url: "redis://user:pw@example.com?family=0" })
    ).toEqual({ host: "example.com", port: 6379 });
  });

  it("drops the password from host/port connections", () => {
    expect(
      redactConnection({ host: "localhost", port: 6380, password: "secret" })
    ).toEqual({ host: "localhost", port: 6380 });
  });

  it("never leaks the password in the output", () => {
    const out = JSON.stringify(
      redactConnection({ url: "redis://default:topsecret@h:6379" })
    );
    expect(out).not.toContain("topsecret");
  });

  it("falls back safely on an unparseable url", () => {
    expect(redactConnection({ url: "not a url" })).toEqual({
      host: "redacted",
    });
  });
});
