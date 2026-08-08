import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { authFetch } from './authFetch'

export const apiClient = createClient<paths>({
  baseUrl: '',
  fetch: authFetch,
})
