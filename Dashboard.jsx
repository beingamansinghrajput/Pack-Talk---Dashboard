// Adds a satisfying 3D tilt + cursor-following glow to a card on mouse move.
export function handleTiltMove(e) {
  const card = e.currentTarget
  const rect = card.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const cx = rect.width / 2
  const cy = rect.height / 2
  const rotateX = ((y - cy) / cy) * -6
  const rotateY = ((x - cx) / cx) * 6

  card.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`
  card.style.setProperty('--mx', `${x}px`)
  card.style.setProperty('--my', `${y}px`)
}

export function handleTiltLeave(e) {
  e.currentTarget.style.transform = ''
}
