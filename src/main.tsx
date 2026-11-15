import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { setAccessTokenProvider, setUnauthorizedHandler } from '@/api'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { createQueryClient } from '@/lib/query-client'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

const queryClient = createQueryClient()

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Seam for PAN-010: replaced by @mmlabs/auth-client; src/api/ stays untouched.
setAccessTokenProvider(() => useAuthStore.getState().auth.accessToken || null)
setUnauthorizedHandler(() => {
  toast.error('Session expired!')
  useAuthStore.getState().auth.reset()
  queryClient.clear()
  // Relative path only; validated on consume in PAN-010.
  const redirect = router.history.location.href
  router.navigate({ to: '/sign-in', search: { redirect } })
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontProvider>
            <DirectionProvider>
              <RouterProvider router={router} />
            </DirectionProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
