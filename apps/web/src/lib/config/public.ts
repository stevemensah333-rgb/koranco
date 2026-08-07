const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;

if (!apiOrigin) {
  throw new Error("NEXT_PUBLIC_API_ORIGIN is required");
}

export const publicConfig = {
  apiOrigin: apiOrigin.replace(/\/$/, ""),
} as const;
