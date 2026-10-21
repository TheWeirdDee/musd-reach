import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHttpServer, registerHttpPolicy } from "../src/http.js";

// app.inject() connects from 127.0.0.1, which stands in for the reverse proxy.
async function server(trustProxy: string) {
  const env = { CORS_ORIGINS: "http://localhost:3000", RATE_LIMIT_PER_MINUTE: 2, TRUST_PROXY: trustProxy };
  const app = createHttpServer(env);
  await registerHttpPolicy(app, env);
  app.get("/ok", async () => ({ ok: true }));
  app.get("/zod", async (req) => z.object({ n: z.coerce.number().int() }).parse(req.query));
  app.get("/boom", async () => {
    throw new Error('relation "secret_table" does not exist at https://rpc.example/key/abc123');
  });
  return app;
}

/** The client writes the leftmost entry; the proxy appends the real peer address. */
const spoofed = (i: number, real: string) => ({ "x-forwarded-for": `10.0.0.${i}, ${real}` });

describe("rate limiting behind a proxy (F-18)", () => {
  it("does not let a client reset its bucket by rotating X-Forwarded-For (proxy trusted)", async () => {
    const app = await server("127.0.0.1");
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await app.inject({ url: "/ok", headers: spoofed(i, "203.0.113.7") })).statusCode);
    expect(codes).toEqual([200, 200, 429, 429]);
    await app.close();
  });

  it("keys different real clients separately behind the proxy", async () => {
    const app = await server("127.0.0.1");
    for (let i = 0; i < 2; i++) await app.inject({ url: "/ok", headers: spoofed(i, "203.0.113.7") });
    expect((await app.inject({ url: "/ok", headers: spoofed(9, "198.51.100.4") })).statusCode).toBe(200);
    await app.close();
  });

  it("ignores X-Forwarded-For entirely when no proxy is trusted", async () => {
    const app = await server("");
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await app.inject({ url: "/ok", headers: { "x-forwarded-for": `10.0.0.${i}` } })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    await app.close();
  });
});

describe("error mapping", () => {
  it("maps validation errors to 400", async () => {
    const app = await server("");
    const r = await app.inject({ url: "/zod?n=abc" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("INVALID_REQUEST");
    await app.close();
  });

  it("returns a generic 502 without internal detail for upstream failures (F-18)", async () => {
    const app = await server("");
    const r = await app.inject({ url: "/boom" });
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toBe("UPSTREAM_UNAVAILABLE");
    expect(r.body).not.toMatch(/secret_table|rpc\.example|abc123/);
    await app.close();
  });
});
