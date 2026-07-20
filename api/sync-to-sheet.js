import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only accept calls that include our secret, so random visitors can't spam the sheet
  const secret = req.headers['x-sync-secret'];
  if (secret !== process.env.SHEET_SYNC_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Supabase webhooks wrap the new row inside "record"
    const row = req.body.record || req.body;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const values = [[
      row.project_id ?? '',
      row.uid ?? '',
      row.ip_address ?? '',
      row.status ?? '',
      row.screener_pass ?? '',
      row.quota_status ?? '',
      row.completed ?? '',
      row.start_time ?? '',
      row.end_time ?? '',
      row.duration_min ?? '',
      row.created_at ?? '',
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:K',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sheet sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
