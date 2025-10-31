// astro.config.mjs
import { defineConfig } from 'astro/config'
import tailwindcss from "@tailwindcss/vite";
import react from '@astrojs/react'

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
    },
  },
})
