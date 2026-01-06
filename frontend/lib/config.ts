// lib/config.ts
const FALLBACK_API_URL = "https://alex-ai-rxh3.onrender.com";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL?.trim() || FALLBACK_API_URL).replace(
  /\/$/,
  ""
);
