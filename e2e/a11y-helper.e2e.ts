import { expectNoSeriousA11y } from './support/a11y'
import { expect, test } from './support/fixtures'

test('a11y helper fails on a serious violation and on a stale known issue', async ({
  page,
}) => {
  await page.setContent('<main><h1>t</h1><img src="data:,"></main>')
  await expect(expectNoSeriousA11y(page, 'self-check', [])).rejects.toThrow(
    /image-alt/
  )

  await page.setContent('<main><h1>t</h1></main>')
  await expect(
    expectNoSeriousA11y(page, 'self-check', [
      {
        rule: 'image-alt',
        pageId: 'self-check',
        target: 'img',
        reason: 'self-check',
        followUp: 'none',
      },
    ])
  ).rejects.toThrow(/stale known issue/)
})
