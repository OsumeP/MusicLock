import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { SystemStatusPage } from './pages/SystemStatusPage'
import { VaultHomePage } from './pages/VaultHomePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/estado" element={<SystemStatusPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <VaultHomePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
