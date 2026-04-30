import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const uploadFile = async (file) => {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post('/upload', fd)
  return data
}

export const anonymize = (text, mode = 'pseudonymise') =>
  api.post('/anonymize', { text, mode }).then(r => r.data)

export const summarize = (text, document_type = 'SUGAM Application') =>
  api.post('/summarize', { text, document_type }).then(r => r.data)

export const classify = (text) =>
  api.post('/classify', { text }).then(r => r.data)

export const classifyBatch = (reports) =>
  api.post('/classify/batch', { reports }).then(r => r.data)

export const detectDuplicate = (text1, text2) =>
  api.post('/duplicate', { text1, text2 }).then(r => r.data)

export const compareDocuments = (document1, document2) =>
  api.post('/compare', { document1, document2 }).then(r => r.data)

export const assessCompleteness = (text, checklist_type = 'Clinical Trial Application') =>
  api.post('/completeness', { text, checklist_type }).then(r => r.data)

export const generateReport = (text, report_type = 'GMP Inspection') =>
  api.post('/report', { text, report_type }).then(r => r.data)

export const healthCheck = () =>
  api.get('/health').then(r => r.data)
