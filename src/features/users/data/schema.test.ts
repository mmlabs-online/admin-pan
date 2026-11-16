import { describe, expect, it } from 'vitest'
import { usersSearchSchema } from './schema'

describe('usersSearchSchema', () => {
  it('drops an email key and keeps page/pageSize/status', () => {
    expect(
      usersSearchSchema.parse({
        email: 'alice@example.com',
        page: 2,
        pageSize: 20,
        status: ['disabled'],
      })
    ).toEqual({ page: 2, pageSize: 20, status: ['disabled'] })
  })
})
