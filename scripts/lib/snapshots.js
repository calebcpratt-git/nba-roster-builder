const fs = require('fs')
const path = require('path')

const SNAPSHOTS_DIR = path.join(__dirname, '../../snapshots')

function snapshotPath(kind) {
  return path.join(SNAPSHOTS_DIR, `${kind}.json`)
}

function loadPreviousSnapshot(kind) {
  const file = snapshotPath(kind)
  if (!fs.existsSync(file)) return []
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

function saveSnapshot(kind, records) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  fs.writeFileSync(snapshotPath(kind), JSON.stringify(records, null, 2) + '\n')
}

module.exports = { loadPreviousSnapshot, saveSnapshot }
