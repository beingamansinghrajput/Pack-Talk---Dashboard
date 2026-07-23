import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { error, count } = await supabase
    .from('track_hits')
    .delete()
    .lt('created_at', cutoff)
    .select('id', { count: 'exact' })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true, deleted: count ?? 0 })
}
