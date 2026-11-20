export const environment = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  diagnosticsEnabled: import.meta.env.VITE_ENABLE_LOCAL_DIAGNOSTICS === 'true',
}
