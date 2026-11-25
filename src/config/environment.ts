import { readSubmissionUploadOrigin } from './submissionUploadOrigin'

const diagnosticsEnabled = import.meta.env.VITE_ENABLE_LOCAL_DIAGNOSTICS === 'true'

export const environment = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  publicSiteOrigin: import.meta.env.VITE_PUBLIC_SITE_ORIGIN ?? '',
  diagnosticsEnabled,
  submissionUploadOrigin: readSubmissionUploadOrigin(import.meta.env.VITE_SUBMISSION_UPLOAD_ORIGIN, diagnosticsEnabled || import.meta.env.DEV),
}
