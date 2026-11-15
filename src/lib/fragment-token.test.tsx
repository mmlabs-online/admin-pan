import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { readFragmentToken, useFragmentToken } from './fragment-token'

const replace = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { replace } }),
}))

const TOKEN = 'a'.repeat(43)

describe('readFragmentToken', () => {
  it('accepts a 43-char token, rejects short/invalid chars/missing', () => {
    expect(readFragmentToken(`#token=${TOKEN}`)).toBe(TOKEN)
    expect(readFragmentToken('#token=short')).toBeNull()
    expect(readFragmentToken(`#token=${'a'.repeat(42)}!`)).toBeNull()
    expect(readFragmentToken('')).toBeNull()
  })

  it('ignores ?token= in search', () => {
    expect(readFragmentToken(`?token=${TOKEN}`)).toBeNull()
  })
})

function Probe() {
  return <p>{String(useFragmentToken('/reset-password'))}</p>
}

describe('useFragmentToken', () => {
  it('captures once under StrictMode, then strips the hash exactly once', async () => {
    replace.mockReset()
    replace.mockImplementation((p: string) =>
      window.history.replaceState(null, '', p)
    )
    window.history.replaceState(null, '', `/#token=${TOKEN}`)
    const screen = await render(
      <StrictMode>
        <Probe />
      </StrictMode>
    )
    await expect.element(screen.getByText(TOKEN)).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/reset-password')
    window.history.replaceState(null, '', '/')
  })
})
