// The seam between the API client and the auth gate (R3). No token here: it
// stays inside @mmlabs/auth-client; this only signals a final 401.
let handler: () => void = () => {}
let epoch = 0

export function setUnauthorizedHandler(h: () => void) {
  handler = h
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
