// The seam between the API client and authentication (R3). No auth logic here:
// the token lives in whoever registers the provider (in memory), never here.
type TokenProvider = () => string | null | Promise<string | null>

let provider: TokenProvider = () => null
let handler: () => void = () => {}
let epoch = 0

export function setAccessTokenProvider(p: TokenProvider) {
  provider = p
}

export function setUnauthorizedHandler(h: () => void) {
  handler = h
}

export async function getAccessToken(): Promise<string | null> {
  return provider()
}

export function currentAuthEpoch(): number {
  return epoch
}

/** Calls the handler once per auth generation, so concurrent 401s fire it once. */
export function notifyUnauthorized(requestEpoch: number) {
  if (requestEpoch !== epoch) return
  epoch++
  handler()
}
