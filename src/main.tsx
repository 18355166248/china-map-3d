import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'
import ConfigPage from './pages/ConfigPage'

// BrowserRouter 路由：/ → 地图；/config → 配置页
const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/config', element: <ConfigPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
