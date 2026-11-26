import { readFileSync, writeFileSync } from 'node:fs'
import { readSubmissionUploadOrigin } from '../src/config/submissionUploadOrigin.ts'

const configured = process.env.VITE_SUBMISSION_UPLOAD_ORIGIN
const diagnosticsEnabled = process.env.VITE_ENABLE_LOCAL_DIAGNOSTICS === 'true'
const origin = readSubmissionUploadOrigin(configured, diagnosticsEnabled)
if (configured && !origin) throw new Error('Configure uma única origem válida para o armazenamento de envio.')

const template = readFileSync(new URL('default.conf', import.meta.url), 'utf8')
const rule = "connect-src 'self';"
if (!template.includes(rule)) throw new Error('A diretiva connect-src padrão não está disponível.')
const configuredRule = origin ? `connect-src 'self' ${origin};` : rule
writeFileSync(new URL('compiled.conf', import.meta.url), template.replace(rule, configuredRule))
