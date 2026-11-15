export type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    }
  ) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | undefined

/** Loads the Turnstile script once; the seam tests replace. */
export function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error('turnstile missing'))
    script.onerror = () => reject(new Error('turnstile load failed'))
    document.head.appendChild(script)
  }).catch((e: unknown) => {
    loading = undefined // allow retry
    throw e
  })
  return loading
}
