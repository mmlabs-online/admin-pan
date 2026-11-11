// Mock until org-admin-api provides a reports API (gap, not ticketed yet)
import { Faker, en } from '@faker-js/faker'
import { appKeys, reportTypes } from './data'
import { type Report, type ReportStatus } from './schema'

// Own Faker instance with a fixed seed so other features' seeds don't interfere.
const faker = new Faker({ locale: [en] })
faker.seed(20261101)

const REF_DATE = new Date('2026-11-01T09:00:00Z')

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)

const staff = Array.from(
  { length: 6 },
  () =>
    `${faker.person.firstName().toLowerCase()}.${faker.person.lastName().toLowerCase()}@mmlabs.online`
)

export const reports: Report[] = Array.from({ length: 25 }, () => {
  const type = faker.helpers.arrayElement(reportTypes).value
  const schedule = faker.helpers.weightedArrayElement([
    { weight: 4, value: 'none' as const },
    { weight: 2, value: 'daily' as const },
    { weight: 2, value: 'weekly' as const },
    { weight: 1, value: 'monthly' as const },
  ])
  const status: ReportStatus =
    schedule !== 'none' && faker.datatype.boolean(0.4)
      ? 'scheduled'
      : faker.helpers.weightedArrayElement([
          { weight: 5, value: 'ready' as const },
          { weight: 1, value: 'failed' as const },
        ])
  const created = faker.date.past({ years: 1, refDate: REF_DATE })
  const dateTo = faker.date.between({ from: created, to: REF_DATE })
  const dateFrom = faker.date.recent({ days: 90, refDate: dateTo })
  const hasRun = status !== 'scheduled' || faker.datatype.boolean(0.5)
  const lastRun = hasRun
    ? faker.date.between({ from: created, to: REF_DATE }).toISOString()
    : null
  const appKey = faker.datatype.boolean(0.5)
    ? faker.helpers.arrayElement(appKeys)
    : undefined
  const typeLabel = reportTypes.find((t) => t.value === type)!.label

  return {
    id: faker.string.uuid(),
    name: `${typeLabel}${appKey ? ` – ${appKey}` : ''} (${faker.helpers.arrayElement(['Q3', 'Q4', 'monthly', 'ops', 'board', 'review'])})`,
    type,
    params: {
      ...(appKey ? { app_key: appKey } : {}),
      date_from: toIsoDate(dateFrom),
      date_to: toIsoDate(dateTo),
    },
    format: faker.helpers.arrayElement(['csv', 'xlsx'] as const),
    schedule,
    status,
    last_run_at: lastRun,
    row_count:
      status === 'ready' && lastRun
        ? faker.number.int({ min: 12, max: 8000 })
        : null,
    created_by: faker.helpers.arrayElement(staff),
    created_at: created.toISOString(),
  }
})

/** Weekly sign-ups across all apps (mock aggregate for the Overview tab). */
export const signupsPerWeek: { week_start: string; signups: number }[] =
  Array.from({ length: 12 }, (_, i) => {
    const d = new Date(REF_DATE)
    d.setUTCDate(d.getUTCDate() - (11 - i) * 7)
    return {
      week_start: toIsoDate(d),
      signups: faker.number.int({ min: 40, max: 320 }),
    }
  })

/** Members per app (mock aggregate for the Overview tab). */
export const membersPerApp: { app_key: string; members: number }[] =
  appKeys.map((app_key) => ({
    app_key,
    members: faker.number.int({ min: 150, max: 4200 }),
  }))
