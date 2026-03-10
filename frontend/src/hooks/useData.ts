'use client'

import useSWR from 'swr'
import { useAuth } from './useAuth'
import { metricsApi, projectsApi, alertsApi, driftApi, apiKeysApi } from '@/lib/api'
import type { MetricsResponse, Alert, DriftTest, Project, ApiKey } from '@/lib/api'

const { token } = useAuth()
console.log("TOKEN:", token)

// Generic fetcher that injects the auth token
function useAuthedSWR<T>(key: string | null, fetcher: (token: string) => Promise<T>) {
  const { token } = useAuth()
   return useSWR<T>(
  key ? [key, token] : null,
  ([, t]) => fetcher(t as string),
    {
      refreshInterval: 30_000,   // Refresh every 30s
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
    }
  )
}

export function useProjects() {
  return useAuthedSWR<Project[]>('/projects', (token) => projectsApi.list(token))
}

export function useProject(id: string | null) {
  return useAuthedSWR<Project>(
    id ? `/projects/${id}` : null,
    (token) => projectsApi.get(id!, token)
  )
}

export function useMetrics(projectId: string | null, days = 30) {
  return useAuthedSWR<MetricsResponse>(
    projectId ? `/projects/${projectId}/metrics?days=${days}` : null,
    (token) => metricsApi.get(projectId!, days, token)
  )
}

export function useAlerts(projectId: string | null, status = 'active') {
  return useAuthedSWR<Alert[]>(
    projectId ? `/projects/${projectId}/alerts?status=${status}` : null,
    (token) => alertsApi.list(projectId!, token, status)
  )
}

export function useDriftTests(projectId: string | null) {
  return useAuthedSWR<DriftTest[]>(
    projectId ? `/projects/${projectId}/drift-tests` : null,
    (token) => driftApi.list(projectId!, token)
  )
}

export function useApiKeys(projectId: string | null) {
  return useAuthedSWR<ApiKey[]>(
    projectId ? `/projects/${projectId}/api-keys` : null,
    (token) => apiKeysApi.list(projectId!, token)
  )
}
