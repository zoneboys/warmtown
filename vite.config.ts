import { loadEnv } from 'vite'
import { defineConfig, type Plugin } from 'vitest/config'
// The workspace ships Vite's Node runtime, but not @types/node; keep this small preview adapter self-typed.
// @ts-expect-error Node runtime modules are available to Vite, but this project does not include @types/node.
const fs = (await import('node:fs')) as unknown as {
  existsSync(file: string): boolean
  createReadStream(file: string): { pipe(response: unknown): void }
}
// @ts-expect-error Node runtime modules are available to Vite, but this project does not include @types/node.
const path = (await import('node:path')) as unknown as { resolve(...parts: string[]): string }

// Relative base keeps production output portable; the Session owns preview HOST/PORT.
function stagingPreviewPlugin(): Plugin {
  return {
    name: 'warmtown-staging-assets',
    configureServer(server) {
      server.middlewares.use('/staging/assets', (req, res, next) => {
        const requestPath = (req as { url?: string }).url?.split('?')[0] ?? ''
        const relative = decodeURIComponent(requestPath)
          .replace(/^\/+/, '')
          .replace(/^staging\/assets\//, '')
        const root = path.resolve('staging/assets')
        const file = path.resolve(root, relative)
        if (!file.startsWith(`${root}/`) && !file.startsWith(`${root}\\`)) return next()
        if (!fs.existsSync(file)) return next()
        res.setHeader('Content-Type', 'model/gltf-binary')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT', 'VITE_BASE_PATH'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: env.VITE_BASE_PATH || './',
    plugins: [stagingPreviewPlugin()],
    server: {
      host: env.HOST ?? '127.0.0.1', port, strictPort: true,
      allowedHosts: ['.manuspre.computer', '.manus.computer', '.manus-asia.computer', '.manuscomputer.ai', '.manusvm.computer', 'localhost', '127.0.0.1'],
    },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 4600,
      sourcemap: false,
      rollupOptions: {
        input: {
          game: 'index.html',
          website: 'website/index.html',
        },
      },
    },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})
