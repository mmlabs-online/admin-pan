// Mock data — replaced by org-admin-api `GET /api/v1/users` (USR-01b) in a later ticket.
import { faker } from '@faker-js/faker'
import { type User, userListSchema } from './schema'

// Set a fixed seed for consistent data generation
faker.seed(67890)

const REFERENCE_DATE = new Date('2026-11-01T00:00:00Z')

export const users: User[] = userListSchema.parse(
  Array.from({ length: 200 }, () => {
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    const createdAt = faker.date.past({ years: 2, refDate: REFERENCE_DATE })
    const verified = faker.datatype.boolean({ probability: 0.8 })
    const emailVerifiedAt = verified
      ? faker.date.between({ from: createdAt, to: REFERENCE_DATE })
      : null
    const updatedAt = faker.date.between({
      from: emailVerifiedAt ?? createdAt,
      to: REFERENCE_DATE,
    })
    return {
      id: faker.string.uuid(),
      email: faker.internet
        .email({ firstName, lastName, provider: 'example.com' })
        .toLowerCase(),
      display_name: faker.datatype.boolean({ probability: 0.75 })
        ? `${firstName} ${lastName}`
        : null,
      status: faker.helpers.weightedArrayElement([
        { weight: 9, value: 'active' },
        { weight: 1, value: 'disabled' },
      ]),
      email_verified_at: emailVerifiedAt?.toISOString() ?? null,
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
    }
  })
)
