import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import Layout from './components/layout/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import LeadsList from './pages/leads/LeadsList'
import LeadDetail from './pages/leads/LeadDetail'
import Pipeline from './pages/pipeline/Pipeline'
import SequencesList from './pages/sequences/SequencesList'
import SequenceDetail from './pages/sequences/SequenceDetail'
import MeetingsList from './pages/meetings/MeetingsList'
import BookingPage from './pages/booking/BookingPage'
import QuotesList from './pages/quotes/QuotesList'
import QuoteDetail from './pages/quotes/QuoteDetail'
import TeamSettings from './pages/settings/TeamSettings'
import Notifications from './pages/notifications/Notifications'
import Analytics from './pages/analytics/Analytics'
import SegmentsList from './pages/segments/SegmentsList'
import GtmDashboard from './pages/gtm/GtmDashboard'
import GtmWorkspaceDetail from './pages/gtm/GtmWorkspaceDetail'

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/book/:userId" element={<BookingPage />} />

        {/* Protected routes */}
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="leads" element={<LeadsList />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="sequences" element={<SequencesList />} />
          <Route path="sequences/:id" element={<SequenceDetail />} />
          <Route path="meetings" element={<MeetingsList />} />
          <Route path="quotes" element={<QuotesList />} />
          <Route path="quotes/:id" element={<QuoteDetail />} />
          <Route path="settings/team" element={<TeamSettings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="segments" element={<SegmentsList />} />
          <Route path="gtm" element={<GtmDashboard />} />
          <Route path="gtm/:workspaceId" element={<GtmWorkspaceDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
