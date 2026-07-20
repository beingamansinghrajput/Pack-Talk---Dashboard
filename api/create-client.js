import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, password } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' })
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (userError) {
      return res.status(400).json({ error: userError.message })
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ full_name: name, role: 'client' })
      .eq('id', userData.user.id)

    if (profileError) {
      return res.status(400).json({ error: profileError.message })
    }

    return res.status(200).json({ success: true, id: userData.user.id })
  } catch (err) {
    console.error('Create client error:', err)
    return res.status(500).json({ error: err.message })
  }
}
