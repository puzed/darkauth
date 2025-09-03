import { execSync } from 'child_process'
import { existsSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const CHANGELOG_DIR = 'changelog'

if (!existsSync(CHANGELOG_DIR)) {
  throw new Error(`Changelog directory '${CHANGELOG_DIR}' does not exist. Please create it first.`)
}

function getLatestChangelogDate() {
  const files = readdirSync(CHANGELOG_DIR).filter((file) => file.endsWith('.md'))
  if (files.length === 0) {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d
  }
  const dates = files
    .map((file) => file.replace('.md', ''))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map((date) => new Date(date))
    .sort((a, b) => b.getTime() - a.getTime())
  return dates[0] || new Date('2025-01-01')
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

function getCommitsSince(sinceDate) {
  try {
    const sinceDateStr = formatDate(sinceDate)
    const command = `git log --since="${sinceDateStr}" --oneline --date=short --reverse`
    const output = execSync(command, { encoding: 'utf8' }).trim()
    if (!output) return []
    return output.split('\n').map((line) => {
      const spaceIndex = line.indexOf(' ')
      const hash = line.substring(0, spaceIndex)
      let message = line.substring(spaceIndex + 1)
      message = message.replace(/\\n/g, '\n')
      const dateCommand = `git show -s --format=%ad --date=short ${hash}`
      const date = execSync(dateCommand, { encoding: 'utf8' }).trim()
      return { hash, date, message }
    })
  } catch (error) {
    console.error('Failed to get git commits:', error.message)
    return []
  }
}

function groupCommitsByDate(commits) {
  const groups = {}
  for (const commit of commits) {
    if (!groups[commit.date]) groups[commit.date] = []
    groups[commit.date].push(commit)
  }
  return groups
}

function generateTitle(_commits, date) {
  return `Changes for ${date}`
}

function createChangelogEntry(date, commits) {
  const fileName = `${date}.md`
  const filePath = join(CHANGELOG_DIR, fileName)
  if (existsSync(filePath)) {
    console.log(`Skipping ${fileName} - file already exists`)
    return false
  }
  const title = generateTitle(commits, date)
  const commitHashes = commits.map((commit) => commit.hash.substring(0, 7)).join(', ')
  const changes = commits.map((commit) => {
    const lines = commit.message.split('\n')
    const mainMessage = lines[0]
    const details = lines.slice(1).filter((line) => line.trim())
    if (details.length > 0) {
      const detailBullets = details
        .map((detail) => detail.replace(/^-\s*/, ''))
        .map((d) => `- ${d}`)
        .join('\n')
      return `## ${commit.hash.substring(0, 7)} ${mainMessage}\n${detailBullets}`
    } else {
      return `## ${commit.hash.substring(0, 7)} ${mainMessage}`
    }
  })
  const content = `date: ${date}\ntitle: ${title}\ncommits: ${commitHashes}\nreviewed: false\n---\n${changes.join('\n\n')}`
  writeFileSync(filePath, content, 'utf8')
  console.log(`Created ${fileName}`)
  return true
}

function main() {
  console.log('Generating changelog entries...')
  const latestDate = getLatestChangelogDate()
  console.log(`Latest changelog entry: ${formatDate(latestDate)}`)
  const commits = getCommitsSince(latestDate)
  console.log(`Found ${commits.length} commits since ${formatDate(latestDate)}`)
  if (commits.length === 0) {
    console.log('No new commits to process')
    return
  }
  const commitsByDate = groupCommitsByDate(commits)
  const dates = Object.keys(commitsByDate).sort()
  let filesCreated = 0
  for (const date of dates) {
    if (createChangelogEntry(date, commitsByDate[date])) filesCreated++
  }
  console.log(`Created ${filesCreated} changelog entries`)
}

main()

