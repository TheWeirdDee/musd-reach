/** Public read-only history service. An explicitly empty env value disables it. Never put secrets here. */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://musd-reach-api.onrender.com";
