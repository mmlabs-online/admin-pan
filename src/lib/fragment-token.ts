import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'

const TOKEN = /^[A-Za-z0-9_-]{32,128}$/

/** Token from `#token=…` (the emailed link shape), or null if absent/malformed. */
export function readFragmentToken(hash: string): string | null {
  if (!hash.startsWith('#')) return null
  const value = new URLSearchParams(hash.slice(1)).get('token')
  return value !== null && TOKEN.test(value) ? value : null
}

/**
 * Captures the token from the URL fragment into component state, then removes
 * the fragment from the address bar. Never reads `?token=` (R5).
 */
export function useFragmentToken(path: string): string | null {
  const router = useRouter()
  const [token] = useState(() => readFragmentToken(window.location.hash))
  useEffect(() => {
    if (window.location.hash) router.history.replace(path)
  }, [router, path])
  return token
}
