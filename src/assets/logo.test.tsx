import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Logo } from './logo'

test('has the mmlabs Admin accessible name', async () => {
  const screen = await render(<Logo />)
  expect(screen.container.querySelector('svg title')?.textContent).toBe(
    'mmlabs Admin'
  )
})
