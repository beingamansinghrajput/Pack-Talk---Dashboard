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
  const { project, uid, status, age_band, country } = req.query

  if (!project || !uid || !status) {
    return res.status(400).send('Missing required parameters: project, uid, status')
  }

  let mapping = STATUS_MAP[status.toLowerCase()]
  if (!mapping) {
    return res.status(400).send('Invalid status. Use: complete, terminate, quotafull, or security')
  }

  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown'

  const { data: existingIpRows } = await supabase
    .from('responses')
    .select('id')
    .eq('project_id', project)
    .eq('ip_address', ip)
    .limit(1)

  const isDuplicateIp = existingIpRows && existingIpRows.length > 0
  let finalStatusKey = status.toLowerCase()

  if (isDuplicateIp) {
    mapping = STATUS_MAP.terminate
    finalStatusKey = 'terminate'
  }

  const now = new Date().toISOString()

  const { error } = await supabase.from('responses').insert({
    project_id: project,
    uid: uid,
    start_time: now,
    end_time: now,
    country: country || null,
    age_band: age_band || null,
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
      <title>Survey Response Recorded</title>
      <style>
        body { font-family: -apple-system, sans-serif; background: #0a0a0f; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .card { background: #16161f; border: 1px solid #2a2a3a; border-radius: 16px; padding: 28px 32px; max-width: 720px; width: 100%; }
        h1 { font-size: 18px; margin: 0 0 20px 0; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { text-align: left; padding: 10px 14px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2a2a3a; }
        td { padding: 14px; font-size: 15px; border-bottom: 1px solid #22222f; font-family: monospace; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 13px; background: rgba(34,197,94,0.15); color: #22c55e; }
        .status-badge.term { background: rgba(220,38,38,0.15); color: #f87171; }
        .status-badge.qf { background: rgba(217,119,6,0.15); color: #f59e0b; }
        .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 16px; }
        .dupe-note { text-align: center; color: #f59e0b; font-size: 12px; margin-bottom: 16px; }
        button { display: block; margin: 0 auto; background: linear-gradient(90deg, #f97316, #a855f7); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        button:active { transform: scale(0.97); }
        .copied { color: #22c55e; text-align: center; font-size: 13px; margin-top: 10px; min-height: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Response Recorded</h1>
        <div class="meta">Project: ${project}</div>
        ${isDuplicateIp ? `<div class="dupe-note">This IP address already submitted a response for this project. Automatically marked Terminated.</div>` : ''}
        <table>
          <thead>
            <tr><th>UID / Sting ID</th><th>IP Address</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>${uid}</td>
              <td>${ip}</td>
              <td><span class="status-badge ${finalStatusKey === 'terminate' || finalStatusKey === 'security' ? 'term' : finalStatusKey === 'quotafull' ? 'qf' : ''}">${statusLabel}</span></td>
            </tr>
          </tbody>
        </table>
        <button onclick="copyRow()">Copy</button>
        <div class="copied" id="copiedMsg"></div>
      </div>
      <script>
        function copyRow() {
          const text = ${JSON.stringify(copyText)};
          navigator.clipboard.writeText(text).then(() => {
            document.getElementById('copiedMsg').textContent = 'Copied! Paste directly into Excel.';
          }).catch(() => {
            document.getElementById('copiedMsg').textContent = 'Could not copy automatically.';
          });
        }
      </script>
    </body>
    </html>
  `)
}
