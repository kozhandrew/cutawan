import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

function gitCommit(): string {
  if (process.env.CUTAWAN_GIT_SHA) return process.env.CUTAWAN_GIT_SHA
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim()
  } catch {
    return 'unknown'
  }
}
const buildCommit = gitCommit()


export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          inferenceWorker: resolve(__dirname, 'src/main/inference/worker.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    define: {
      'import.meta.env.VITE_CUTAWAN_GIT_SHA': JSON.stringify(buildCommit)
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
