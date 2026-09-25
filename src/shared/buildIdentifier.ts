export function customBuildLabel(commit: string): string {
  const shortCommit = commit.trim().slice(0, 8) || 'unknown'
  return `CUSTOM DEV · ${shortCommit}`
}
