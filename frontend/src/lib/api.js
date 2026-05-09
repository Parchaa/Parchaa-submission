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

export const anonymizePdf = async (file, mode = 'pseudonymise') => {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post(`/anonymize/pdf?mode=${mode}`, fd, {
    responseType: 'blob'
  })
  return data
}

export const summarize = (text, document_type = 'SUGAM Application', sub_type = '', filename = '') =>
  api.post('/summarize', { text, document_type, sub_type, filename }).then(r => r.data)

export const chatWithDocument = (text, question) =>
  api.post('/summarize/chat', { text, question }).then(r => r.data)

export const classify = (text, filename = '') =>
  api.post('/classify', { text, filename }).then(r => r.data)

export const classifyBatch = (reports) =>
  api.post('/classify/batch', { reports }).then(r => r.data)

export const detectDuplicate = (text1, text2) =>
  api.post('/duplicate', { text1, text2 }).then(r => r.data)

export const compareDocuments = (document1, document2) =>
  api.post('/compare', { document1, document2 }).then(r => r.data)

export const assessCompleteness = (text, checklist_type = 'Clinical Trial Application', filename = '') =>
  api.post('/completeness', { text, checklist_type, filename }).then(r => r.data)

export const generateReport = (text, report_type = 'GMP Inspection', filename = '') =>
  api.post('/report', { text, report_type, filename }).then(r => r.data)

export const generateReportXlsx = (text, report_type = 'GMP Inspection', filename = '') =>
  api.post('/report/xlsx', { text, report_type, filename }, { responseType: 'blob' }).then(r => r.data)

export const getHistory = (module = '', limit = 50) =>
  api.get('/history', { params: { module, limit } }).then(r => r.data)

export const getHistoryItem = (job_id) =>
  api.get(`/history/${job_id}`).then(r => r.data)

export const healthCheck = () =>
  api.get('/health').then(r => r.data)
