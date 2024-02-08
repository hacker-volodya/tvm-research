import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: ["tvm-spec"],
  },
  build: {
    sourcemap: true,
    commonjsOptions: {
      include: [/.js$/],
    },
  },
  base: "/tvm-research/"
})
