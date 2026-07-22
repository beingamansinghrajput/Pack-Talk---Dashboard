import { google } from 'googleapis'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed')
  }

  const { project, uid, ip, age, opinionsCount, opinions } = req.body

  if (!project || !uid || !age || !opinionsCount || !Array.isArray(opinions) || opinions.length === 0) {
    return res.status(400).send('Missing required fields.')
  }

  const MAX_OPINIONS = 30
  const trimmedOpinions = opinions.slice(0, MAX_OPINIONS)
  const paddedOpinions = [
    ...trimmedOpinions,
    ...Array(MAX_OPINIONS - trimmedOpinions.length).fill(''),
  ]

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })

    const values = [[
      project,
      uid,
      ip || '',
      age,
      opinionsCount,
      ...paddedOpinions,
      new Date().toISOString(),
    ]]

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.OPINIONS_SHEET_ID,
      range: "'PackTalk Open-Ended Opinions'!A:AJ",
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    })

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Save opinions error:', err)
    return res.status(500).json({ error: err.message })
  }
}
