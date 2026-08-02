// Packs project_id / country / age_band into an opaque, URL-safe token so
// tracking links handed to clients never expose those values directly in
// the query string. Decoded server-side in api/_lib/trackToken.js — keep
// both in sync.
export function encodeTrackToken(project_id, country, age_band) {
  const payload = JSON.stringify([project_id, country || '', age_band || ''])
  const utf8Safe = unescape(encodeURIComponent(payload))
  const b64 = btoa(utf8Safe)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
