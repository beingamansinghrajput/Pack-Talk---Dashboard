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

  const mapping = STATUS_MAP[status.toLowerCase()]
  if (!mapping) {
    return res.status(400).send('Invalid status. Use: complete, terminate, quotafull, or security')
  }

  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown'

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
  })

  if (error) {
    return res.status(500).send('Error logging response: ' + error.message)
  }

  const statusLabel = {
    complete: 'Completed',
    terminate: 'Terminated',
    quotafull: 'Quota Full',
    security: 'Security Terminated',
  }[status.toLowerCase()]

  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Survey Response Recorded</title>
      <style>
        body { font-family: -apple-system, sans-serif; background: #0a0a0f; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #16161f; border: 1px solid #2a2a3a; border-radius: 16px; padding: 32px 40px; max-width: 420px; text-align: center; }
        h1 { font-size: 20px; margin-bottom: 20px; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #22222f; font-size: 14px; }
        .row span:first-child { color: #888; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: 600; margin-top: 16px; background: rgba(34,197,94,0.15); color: #22c55e; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Response Recorded</h1>
        <div class="row"><span>Project ID</span><span>${project}</span></div>
        <div class="row"><span>UID</span><span>${uid}</span></div>
        <div class="row"><span>IP Address</span><span>${ip}</span></div>
        <div class="status">${statusLabel}</div>
      </div>
    </body>
    </html>
  `)
}
