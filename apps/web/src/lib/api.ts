// Same-origin requests work on both the custom domain and Vercel previews.
// npm run dev continues to use the standalone local API on port 3001.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:3001");
