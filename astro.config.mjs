// astro.config.mjs
import { defineConfig } from 'astro/config'
import tailwindcss from "@tailwindcss/vite";
import react from '@astrojs/react'
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: 'https://basketsman16bdg.my.id',
  integrations: [
    react(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
    },
  },
});
