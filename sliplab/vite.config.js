import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // During local dev, `vercel dev` runs the API on :3000
    proxy: { "/api": "http://localhost:3000" },
  },
});
