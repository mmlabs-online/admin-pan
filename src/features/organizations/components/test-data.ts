import { type Organization } from '../data/schema'

export const MOCK_ORGS: Organization[] = [
  {
    id: '6f1c2c1e-7a4b-4a53-9f0e-1d2c3b4a5e60',
    slug: 'acme',
    name: 'Acme Corp',
    description: 'Rockets and anvils',
    status: 'active',
    created_by: null,
    created_at: '2026-01-05T10:00:00.000Z',
    updated_at: '2026-01-05T10:00:00.000Z',
  },
  {
    id: '7a2d3e4f-5b6c-4d7e-8f90-a1b2c3d4e5f6',
    slug: 'globex',
    name: 'Globex',
    description: null,
    status: 'suspended',
    created_by: '0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e',
    created_at: '2026-02-10T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
  },
  {
    id: '8b3e4f5a-6c7d-4e8f-9a01-b2c3d4e5f6a7',
    slug: 'initech',
    name: 'Initech',
    description: 'TPS reports',
    status: 'active',
    created_by: null,
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T10:00:00.000Z',
  },
]
