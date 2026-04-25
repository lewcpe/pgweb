import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { DatabaseDetailPage } from './pages/DatabaseDetailPage'
import { Navigation } from './components/Navigation'
import { Toaster } from './components/ui/toaster'
import { ThemeProvider } from './components/ui/theme-provider'

function App() {
  return (
    <ThemeProvider defaultTheme="system" enableSystem disableTransitionOnChange>
      <div className="min-h-screen bg-background">
        <Navigation />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/databases/:id" element={<DatabaseDetailPage />} />
          </Routes>
        </main>
        <Toaster />
      </div>
    </ThemeProvider>
  )
}

export default App