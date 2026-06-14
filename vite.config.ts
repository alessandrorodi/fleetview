import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset paths relative so the same build works when hosted at
// any path AND when later loaded from a browser-extension package.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
