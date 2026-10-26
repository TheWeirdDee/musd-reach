import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHttpServer, registerHttpPolicy } from "../src/http.js";
import { loadEnv } from "../src/config.js";

// app.inject() connects from 127.0.0.1, which stands in for the reverse proxy.
async function server(trustProxy: string, clientIpHeader = "") {
  const env = { CORS_ORIGINS: "http://localhost:3000", RATE_LIMIT_PER_MINUTE: 2, TRUST_PROXY: trustProxy, CLIENT_IP_HEADER: clientIpHeader };
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

describe("edge-written client IP header (Railway X-Real-IP)", () => {
  it("is ignored unless configured, so rotating it cannot reset a bucket", async () => {
    const app = await server("");
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await app.inject({ url: "/ok", headers: { "x-real-ip": `10.0.0.${i}` } })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    await app.close();
  });

  it("keys clients by the edge-written value when configured", async () => {
    const app = await server("", "x-real-ip");
    for (let i = 0; i < 2; i++) await app.inject({ url: "/ok", headers: { "x-real-ip": "203.0.113.7" } });
    expect((await app.inject({ url: "/ok", headers: { "x-real-ip": "203.0.113.7" } })).statusCode).toBe(429);
    expect((await app.inject({ url: "/ok", headers: { "x-real-ip": "198.51.100.4" } })).statusCode).toBe(200);
    await app.close();
  });

  it("falls back to the socket address for a malformed value", async () => {
    const app = await server("", "x-real-ip");
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await app.inject({ url: "/ok", headers: { "x-real-ip": `junk-${i}` } })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    await app.close();
  });
});

describe("CORS origins", () => {
  it("matches a configured origin pasted with a trailing slash, and nothing else", async () => {
    const env = { CORS_ORIGINS: " https://musd-reach.vercel.app/ ", RATE_LIMIT_PER_MINUTE: 100, TRUST_PROXY: "" };
    const app = createHttpServer(env);
    await registerHttpPolicy(app, env);
    app.get("/ok", async () => ({ ok: true }));
    const allowed = await app.inject({ url: "/ok", headers: { origin: "https://musd-reach.vercel.app" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://musd-reach.vercel.app");
    const other = await app.inject({ url: "/ok", headers: { origin: "https://evil.invalid" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
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

describe("proxy configuration", { timeout: 30_000 }, () => {
  it("refuses TRUST_PROXY and CLIENT_IP_HEADER together and non-header values; normalises header case", async () => {
    expect(() => loadEnv({ TRUST_PROXY: "10.0.0.1", CLIENT_IP_HEADER: "x-real-ip" })).toThrow(/not both/);
    expect(() => loadEnv({ CLIENT_IP_HEADER: '"cf-connecting-ip"' })).toThrow(/not a header name/);
    expect(() => loadEnv({ CLIENT_IP_HEADER: "cf connecting ip" })).toThrow(/not a header name/);
    expect(loadEnv({ CLIENT_IP_HEADER: " CF-Connecting-IP " }).CLIENT_IP_HEADER).toBe("cf-connecting-ip");
    expect(loadEnv({ CLIENT_IP_HEADER: "x-real-ip" }).CLIENT_IP_HEADER).toBe("x-real-ip");
  });

  it("listens on the platform PORT unless API_PORT is set", async () => {
    expect(loadEnv({ PORT: "4321" }).API_PORT).toBe(4321);
    expect(loadEnv({ PORT: "4321", API_PORT: "8787" }).API_PORT).toBe(8787);
    expect(loadEnv({}).API_PORT).toBe(8787);
  });

  it("treats empty variables as unset, as in a copied .env.example", async () => {
    const e = loadEnv({ API_PORT: "", PGLITE_DIR: "", DATABASE_URL: "", TRUST_PROXY: "", CLIENT_IP_HEADER: "" });
    expect(e.API_PORT).toBe(8787);
    expect(e.PGLITE_DIR).toMatch(/pglite$/);
    expect(e.DATABASE_URL).toBeUndefined();
  });
});
