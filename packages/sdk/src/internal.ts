export { toHex, type Address, type Hex } from "viem";

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node < 16 fallback is not supported; atob exists in Node >= 16 and browsers.
  throw new Error("atob unavailable");
}
