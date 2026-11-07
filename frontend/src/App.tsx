import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { MyFilesPage } from './pages/MyFilesPage'
import { RegisterPage } from './pages/RegisterPage'
import { SystemStatusPage } from './pages/SystemStatusPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/estado" element={<SystemStatusPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            {/* "Inicio" (dashboard) llega el día 9; mientras tanto la bóveda abre en Mis Archivos. */}
            <Route index element={<Navigate to="/archivos" replace />} />
            <Route path="/archivos" element={<MyFilesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
