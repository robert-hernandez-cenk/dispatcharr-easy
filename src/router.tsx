import { Route, Routes } from 'react-router-dom'
import { AuthGate } from './auth/AuthGate'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </AuthGate>
        }
      />
    </Routes>
  )
}
