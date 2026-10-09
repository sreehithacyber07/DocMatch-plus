import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  /*
    The Vercel environment the bundle was built for ('production', 'preview',
    or empty for a local build). A preview build never persists to the
    database, whatever its environment variables say (persistence/config.ts).
  */
  define: {
    'import.meta.env.VITE_BUILD_TARGET': JSON.stringify(process.env.VERCEL_ENV ?? ''),
    // Research-prototype demonstration unless a build sets VITE_DEMO_MODE=off.
    // In demo mode nothing persists and the clinical workspace is closed.
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify(process.env.VITE_DEMO_MODE ?? 'research-prototype'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@stores': path.resolve(__dirname, 'src/stores'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
})
