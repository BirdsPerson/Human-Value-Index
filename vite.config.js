import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["shared/**/*.test.js", "netlify/**/*.test.js", "src/**/*.test.{js,jsx}"],
  },
});
