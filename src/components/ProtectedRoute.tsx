import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import Auth from '../pages/Auth'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading...</div>
  }

  if (!user) {
    return <Auth />
  }

  return <>{children}</>
}
