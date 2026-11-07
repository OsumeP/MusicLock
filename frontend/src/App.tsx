import { BrowserRouter, Route, Routes } from 'react-router'

import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLayout } from './layout/AppLayout'
import { FavoritesPage } from './pages/FavoritesPage'
import { HomePage } from './pages/HomePage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { MyFilesPage } from './pages/MyFilesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RecentPage } from './pages/RecentPage'
import { RegisterPage } from './pages/RegisterPage'
import { SystemStatusPage } from './pages/SystemStatusPage'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Públicas */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/estado" element={<SystemStatusPage />} />

            {/* Bóveda (requiere sesión con la Master Key disponible) */}
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/inicio" element={<HomePage />} />
              <Route path="/archivos" element={<MyFilesPage />} />
              <Route path="/favoritos" element={<FavoritesPage />} />
              <Route path="/recientes" element={<RecentPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
