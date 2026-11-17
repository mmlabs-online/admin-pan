import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ForgotPassword } from './index'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...p }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}))

describe('forgot-password notice', () => {
  it('shows the reset-from-any-mmlabs-app notice and the administrator fallback', async () => {
    const screen = await render(<ForgotPassword />)
    await expect
      .element(
        screen.getByText(/reset your password from any mmlabs app you use/i)
      )
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByText(
          "If you don't use any other mmlabs app, contact an administrator."
        )
      )
      .toBeInTheDocument()
  })

  it('has no form, input or button and makes no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const screen = await render(<ForgotPassword />)
    expect(screen.getByRole('textbox').elements()).toHaveLength(0)
    expect(screen.getByRole('button').elements()).toHaveLength(0)
    expect(document.querySelector('form')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('links only to /sign-in', async () => {
    const screen = await render(<ForgotPassword />)
    const links = screen.getByRole('link').elements()
    expect(links).toHaveLength(1)
    await expect
      .element(screen.getByRole('link', { name: 'Sign in' }))
      .toHaveAttribute('href', '/sign-in')
  })
})
