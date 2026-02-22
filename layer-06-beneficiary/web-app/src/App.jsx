import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Redeem from './pages/Redeem'
import SurplusMap from './pages/SurplusMap'
import KiranaPOS from './pages/KiranaPOS'
import Login from './pages/Login'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/redeem" element={<ProtectedRoute><Redeem /></ProtectedRoute>} />
            <Route path="/surplus-map" element={<SurplusMap />} />
            <Route path="/kirana" element={<KiranaPOS />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}
