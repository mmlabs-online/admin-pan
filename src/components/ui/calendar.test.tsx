import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Calendar } from './calendar'

test('month dropdown uses English short month names', async () => {
  const screen = await render(
    <Calendar mode='single' captionLayout='dropdown' />
  )
  const select = screen.container.querySelector(
    'select.rdp-months_dropdown, select'
  )
  const labels = Array.from(select!.querySelectorAll('option')).map(
    (o) => o.textContent
  )
  expect(labels).toEqual([
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ])
})
