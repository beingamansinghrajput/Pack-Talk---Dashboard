import { useState } from 'react'

let idCounter = 0
function nextId() {
  idCounter += 1
  return `cb_${Date.now()}_${idCounter}`
}

function emptyLink(n) {
  return { id: nextId(), label: `Link ${n}`, target_count: '', survey_url: '', client_redirect_url: '' }
}

function emptyCountry() {
  return { id: nextId(), country: '', age_band: '', links: [emptyLink(1)] }
}

// Converts the builder's nested state into flat rows ready for project_quotas.
export function flattenCountryBlocks(countries, project_id) {
  const rows = []
  countries.forEach((c) => {
    const country = c.country.trim()
    const ageBand = c.age_band.trim() || 'All'
    if (!country) return
    c.links.forEach((l) => {
      const targetCount = Number(l.target_count)
      if (isNaN(targetCount) || targetCount <= 0) return
      rows.push({
        project_id,
        country,
        age_band: ageBand,
        link_label: l.label.trim() || 'Link 1',
        target_count: targetCount,
        survey_url: l.survey_url.trim() || null,
        client_redirect_url: l.client_redirect_url.trim() || null,
      })
    })
  })
  return rows
}

// Controlled component: value = array of country blocks, onChange(newValue).
export default function CountryLinksBuilder({ value, onChange }) {
  const [countryCountInput, setCountryCountInput] = useState(String(value.length || 0))

  function setCountryCount(n) {
    setCountryCountInput(String(n))
    let count = parseInt(n, 10)
    if (isNaN(count) || count < 0) count = 0
    if (count > 30) count = 30
    const next = [...value]
    if (count > next.length) {
      while (next.length < count) next.push(emptyCountry())
    } else if (count < next.length) {
      next.length = count
    }
    onChange(next)
  }

  function updateCountry(idx, patch) {
    const next = value.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    onChange(next)
  }

  function setLinkCount(idx, n) {
    let count = parseInt(n, 10)
    if (isNaN(count) || count < 0) count = 0
    if (count > 20) count = 20
    const c = value[idx]
    const links = [...c.links]
    if (count > links.length) {
      while (links.length < count) links.push(emptyLink(links.length + 1))
    } else if (count < links.length) {
      links.length = Math.max(count, 0)
    }
    updateCountry(idx, { links })
  }

  function updateLink(cIdx, lIdx, patch) {
    const c = value[cIdx]
    const links = c.links.map((l, i) => (i === lIdx ? { ...l, ...patch } : l))
    updateCountry(cIdx, { links })
  }

  return (
    <div>
      <label className="field-label">How many countries is this survey running in?
        <input
          type="number"
          min="0"
          max="30"
          value={countryCountInput}
          onChange={(e) => setCountryCount(e.target.value)}
          style={{ maxWidth: 160 }}
        />
      </label>
      <p className="card-hint">Enter a number and a block will appear below for each country — set its links there.</p>

      {value.map((c, cIdx) => (
        <div key={c.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, marginTop: 14 }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label>Country {cIdx + 1}
              <input
                value={c.country}
                onChange={(e) => updateCountry(cIdx, { country: e.target.value })}
                placeholder="e.g. USA"
              />
            </label>
            <label>Age Band <span className="card-hint">(optional)</span>
              <input
                value={c.age_band}
                onChange={(e) => updateCountry(cIdx, { age_band: e.target.value })}
                placeholder="e.g. 18-34 (leave blank for All)"
              />
            </label>
            <label>How many links for this country?
              <input
                type="number"
                min="1"
                max="20"
                value={c.links.length}
                onChange={(e) => setLinkCount(cIdx, e.target.value)}
              />
            </label>
          </div>

          {c.links.map((l, lIdx) => (
            <div key={l.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
              <label style={{ minWidth: 100 }}>Label
                <input
                  value={l.label}
                  onChange={(e) => updateLink(cIdx, lIdx, { label: e.target.value })}
                  style={{ width: 100 }}
                />
              </label>
              <label style={{ minWidth: 110 }}>Target Count
                <input
                  type="number"
                  min="0"
                  value={l.target_count}
                  onChange={(e) => updateLink(cIdx, lIdx, { target_count: e.target.value })}
                  style={{ width: 110 }}
                />
              </label>
              <label style={{ flex: 1, minWidth: 200 }}>Survey URL
                <input
                  value={l.survey_url}
                  onChange={(e) => updateLink(cIdx, lIdx, { survey_url: e.target.value })}
                  placeholder="https://..."
                />
              </label>
              <label style={{ flex: 1, minWidth: 200 }}>Client Return URL <span className="card-hint">(optional)</span>
                <input
                  value={l.client_redirect_url}
                  onChange={(e) => updateLink(cIdx, lIdx, { client_redirect_url: e.target.value })}
                  placeholder="https://client.com/return?status=[STATUS]&uid=[UID]"
                />
              </label>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export { emptyCountry }
