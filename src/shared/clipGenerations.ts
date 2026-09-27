import type { AnalyzeOptions, ClipGeneration, Project } from './types'

type NewClipGeneration = Omit<ClipGeneration, 'updatedAt'> & { updatedAt?: number }

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function generationOptionsFromProject(project: Project): AnalyzeOptions {
  return {
    prompt: project.prompt,
    clipLength: 'auto',
    broll: false,
    hookFirst: false,
    videoType: project.videoType ?? 'auto',
    visualDiscovery: project.visualDiscovery === true,
    editorialRanking: project.rankingEnabled === true
  }
}

function highlightClips(project: Project) {
  return project.clips.filter((clip) => clip.origin !== 'whole-video')
}

function wholeVideoClips(project: Project) {
  return project.clips.filter((clip) => clip.origin === 'whole-video')
}

function applyGeneration(project: Project, generation: ClipGeneration): void {
  project.activeClipGenerationId = generation.id
  project.clipsGenerationId = generation.id
  // A captioned full-video edit belongs to the project, not to an AI
  // generation. Keep it available while the active highlight list changes.
  project.clips = [...wholeVideoClips(project), ...clone(generation.clips)]
  project.prompt = generation.options.prompt
  project.videoType = generation.options.videoType
  project.visualDiscovery = generation.options.visualDiscovery === true
  project.rankingEnabled = generation.options.editorialRanking === true
  project.discoveryReport = clone(generation.discoveryReport)
  project.editorialRanking = clone(generation.editorialRanking)
}

/** Upgrade a saved project lazily without changing the existing active clip API. */
export function ensureClipGenerationHistory(project: Project, fallback = generationOptionsFromProject(project)): void {
  const highlights = highlightClips(project)
  if (highlights.length === 0) return
  if (!project.clipGenerations?.length) {
    const id = project.activeClipGenerationId ?? project.clipsGenerationId ?? `legacy-${project.id}`
    project.clipGenerations = [{
      id,
      createdAt: project.updatedAt || project.createdAt,
      updatedAt: project.updatedAt || project.createdAt,
      options: clone(fallback),
      clips: clone(highlights),
      discoveryReport: clone(project.discoveryReport),
      editorialRanking: clone(project.editorialRanking)
    }]
    project.activeClipGenerationId = id
    project.clipsGenerationId = id
    return
  }
  const active = project.clipGenerations.find(generation => generation.id === project.activeClipGenerationId)
    ?? project.clipGenerations.find(generation => generation.id === project.clipsGenerationId)
    ?? project.clipGenerations[project.clipGenerations.length - 1]
  if (active) applyGeneration(project, active)
}

/** Keep the persisted generation snapshot aligned with the legacy active fields. */
export function syncActiveClipGeneration(project: Project): void {
  // Migration may create the first snapshot, but an existing snapshot must
  // never be applied here: callers have already edited project.clips in memory.
  if (!project.clipGenerations?.length) ensureClipGenerationHistory(project)
  const active = project.clipGenerations?.find(generation => generation.id === project.activeClipGenerationId)
  if (!active) return
  active.updatedAt = Date.now()
  active.clips = clone(highlightClips(project))
  active.options = {
    ...active.options,
    prompt: project.prompt,
    videoType: project.videoType,
    visualDiscovery: project.visualDiscovery === true,
    editorialRanking: project.rankingEnabled === true
  }
  active.discoveryReport = clone(project.discoveryReport)
  active.editorialRanking = clone(project.editorialRanking)
}

export function appendClipGeneration(project: Project, input: NewClipGeneration): ClipGeneration {
  syncActiveClipGeneration(project)
  const generation: ClipGeneration = {
    ...clone(input),
    updatedAt: input.updatedAt ?? input.createdAt,
    options: {
      ...input.options,
      visualDiscovery: input.options.visualDiscovery === true,
      editorialRanking: input.options.editorialRanking === true
    }
  }
  const generations = project.clipGenerations ?? []
  if (generations.some(item => item.id === generation.id)) throw new Error('Clip generation already exists.')
  project.clipGenerations = [...generations, generation]
  applyGeneration(project, generation)
  project.mode = 'clips'
  return generation
}

export function activateClipGeneration(project: Project, generationId: string): ClipGeneration {
  syncActiveClipGeneration(project)
  const generation = project.clipGenerations?.find(item => item.id === generationId)
  if (!generation) throw new Error('Clip generation not found.')
  applyGeneration(project, generation)
  project.mode = 'clips'
  return generation
}

/** Returns the deleted snapshot; callers may clean only its unreferenced project assets. */
export function deleteClipGeneration(project: Project, generationId: string): ClipGeneration {
  syncActiveClipGeneration(project)
  const generations = project.clipGenerations ?? []
  if (generations.length <= 1) throw new Error('Keep at least one clip generation.')
  const index = generations.findIndex(item => item.id === generationId)
  if (index === -1) throw new Error('Clip generation not found.')
  const [removed] = generations.splice(index, 1)
  project.clipGenerations = generations
  if (project.activeClipGenerationId === generationId) {
    applyGeneration(project, generations[Math.min(index, generations.length - 1)])
    project.mode = 'clips'
  }
  return clone(removed)
}
