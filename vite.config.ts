import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 代理天地图瓦片请求，绕过 CORS（天地图不返回 Access-Control-Allow-Origin）
      // 前端请求 /tianditu/img_w/wmts?... → 转发到 https://t0.tianditu.gov.cn/img_w/wmts?...
      '/tianditu': {
        target: 'https://t0.tianditu.gov.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tianditu/, ''),
      },
    },
  },
})
