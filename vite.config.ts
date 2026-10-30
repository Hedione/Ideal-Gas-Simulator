import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative assets work for both user sites and /repository/ GitHub Pages URLs.
  base: './',
  plugins: [react()],
})
