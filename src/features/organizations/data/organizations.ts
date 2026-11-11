// Mock data: replaced by org-admin-api `GET /api/v1/organizations` (ADM-001) in the API integration ticket.
import { faker } from '@faker-js/faker'
import { type Organization } from './schema'

// Fixed seed for consistent data generation
faker.seed(20261111)

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const usedSlugs = new Set<string>()

export const organizations: Organization[] = Array.from(
  { length: 60 },
  (_, index) => {
    const name = faker.company.name()
    let slug = toSlug(name)
    if (usedSlugs.has(slug)) slug = `${slug}-${index}`
    usedSlugs.add(slug)

    const createdAt = faker.date.past({ years: 2 })
    const updatedAt = faker.date.between({ from: createdAt, to: new Date() })

    return {
      id: faker.string.uuid(),
      slug,
      name,
      description: faker.datatype.boolean({ probability: 0.75 })
        ? faker.company.catchPhrase()
        : null,
      status: faker.helpers.weightedArrayElement([
        { weight: 5, value: 'active' as const },
        { weight: 1, value: 'suspended' as const },
      ]),
      created_by: faker.datatype.boolean({ probability: 0.8 })
        ? faker.string.uuid()
        : null,
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
    }
  }
)
