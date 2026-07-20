import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STATUS_MAP = {
  complete: { completed: true, screener_pass: true, quota_status: 'Open' },
  terminate: { completed: false, screener_pass: false, quota_status: 'Open' },
  quotafull: { completed: false, screener_pass: true, quota_status: 'Full' },
  security: { completed: false, screener_pass: false, quota_status: 'Open' },
}

export default async function handler(req, res) {
  const { project, uid, status } = req.query

  if (!project || !uid || !status) {
    return res.status(400).send('Missing required parameters: project, uid, status')
  }

  let mapping = STATUS_MAP[status.toLowerCase()]
  if (!mapping) {
    return res.status(400).send('Invalid status. Use: complete, terminate, quotafull, or security')
  }

  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown'

  // Check if this IP has already submitted a response for this project
  const { data: existingIpRows } = await supabase
    .from('responses')
    .select('id')
    .eq('project_id', project)
    .eq('ip_address', ip)
    .limit(1)

  const isDuplicateIp = existingIpRows && existingIpRows.length > 0
  let finalStatusKey = status.toLowerCase()

  if (isDuplicateIp) {
    // Force Terminated regardless of what the link said
    mapping = STATUS_MAP.terminate
    finalStatusKey = 'terminate'
  }

  const now = new Date().toISOString()

  const { error } = await supabase.from('responses').insert({
    project_id: project,
    uid: uid,
    start_time: now,
    end_time: now,
    country: null,
    screener_pass: mapping.screener_pass,
    quota_status: mapping.quota_status,
    completed: mapping.completed,
    ip_address: ip,
  })

  if (error) {
    return res.status(500).send('Error logging response: ' + error.message)
  }

  const statusLabel = {
    complete: 'Completed',
    terminate: 'Terminated',
    quotafull: 'Quota Full',
    security: 'Security Terminated',
  }[finalStatusKey]

  const copyText = `UID / Sting ID\tIP Address\tStatus\n${uid}\t${ip}\t${statusLabel}`

  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Survey Response
