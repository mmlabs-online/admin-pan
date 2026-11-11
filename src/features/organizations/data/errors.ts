/** Simulates the API's 409 response for a duplicate slug. */
export class SlugConflictError extends Error {
  constructor(slug: string) {
    super(`An organization with slug "${slug}" already exists.`)
    this.name = 'SlugConflictError'
  }
}
