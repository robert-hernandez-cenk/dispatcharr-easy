import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Center, Loader } from '@mantine/core'
import { useAuthStore, getStoredRefreshToken } from './authStore'
import { refreshAccessToken } from './authClient'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!useAuthStore.getState().isAuthenticated && getStoredRefreshToken()) {
        await refreshAccessToken()
      }
      if (!cancelled) {
        setChecked(true)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (checked && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [checked, isAuthenticated, navigate])

  if (!checked) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
