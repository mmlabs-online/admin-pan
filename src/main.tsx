import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { getAuthClient, setUnauthorizedHandler } from '@/api'
import { AuthProvider } from '@mmlabs/auth-client/react'
import { useSessionRecheck } from '@/stores/session-recheck-store'
import { clearOnAuthChange, createQueryClient } from '@/lib/query-client'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/fonts'
import './styles/index.css'

const queryClient = createQueryClient()

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// A final 401 from the API: the auth gate checks the session again.
setUnauthorizedHandler(() => useSessionRecheck.getState().request())

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
  let auth: ReturnType<typeof getAuthClient> | undefined
  try {
    auth = getAuthClient()
  } catch {
    // Build without its VITE_API_BASE_URL / VITE_APP_KEY: nothing can work.
  }
  if (!auth) {
    root.render(
      <p role='alert' className='p-6 text-sm'>
        This build is missing its API configuration (VITE_API_BASE_URL /
        VITE_APP_KEY).
      </p>
    )
  } else {
    const client = auth
    clearOnAuthChange(queryClient, (l) => client.onChange(l))
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <AuthProvider client={client}>
            <ThemeProvider>
              <FontProvider>
                <DirectionProvider>
                  <RouterProvider router={router} />
                </DirectionProvider>
              </FontProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  }
}
