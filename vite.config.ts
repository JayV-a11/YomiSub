import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import tsconfigPaths from 'vite-tsconfig-paths'
import manifestJson from './manifest.json'
import type { ManifestV3Export } from '@crxjs/vite-plugin'

const manifest = manifestJson as unknown as ManifestV3Export

// NOTE: @crxjs/vite-plugin@2.0.0-beta.23 was developed for Vite 4.
// If Vite 5 causes build errors, downgrade: npm install vite@4
// The production build (npm run build) typically works; dev HMR may have issues.
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    crx({ manifest: manifest }),
  ],
  resolve: {
    alias: {
      // Force the browser build of kuromoji — the Node.js source uses path.join
      // which Vite externalizes and breaks at runtime in the extension context.
      kuromoji: 'kuromoji/build/kuromoji.js',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  // kuromoji browser build is already bundled — no need to pre-bundle
  optimizeDeps: {
    exclude: ['kuromoji'],
  },
})
