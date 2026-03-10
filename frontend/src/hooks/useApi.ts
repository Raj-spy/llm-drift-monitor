import useSWR from "swr"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/v1"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function useMetrics(projectId: string, days = 30) {

  const { data, error, isLoading } = useSWR(
    `${API}/projects/${projectId}/metrics?days=${days}`,
    fetcher,
    {
      refreshInterval: 30000
    }
  )

  return {
    data,
    isLoading,
    isError: error
  }
}