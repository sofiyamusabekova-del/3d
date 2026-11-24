import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // «Качественный снимок» подгружается по запросу; без предварительной сборки Vite в режиме разработки
  // находит эти пакеты при первом нажатии и перезагружает страницу, теряя состояние редактора.
  optimizeDeps: { include: ['three-gpu-pathtracer', 'three-mesh-bvh'] },
})
