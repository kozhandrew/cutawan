import { checkLocalWhisperSetup, checkSubscriptionSetup } from './subscription'
import { cancelLocalWhisperInstall, installLocalWhisper, type LocalWhisperModel } from './localWhisper'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type {
  AnalyzeOptions,
  CaptionVideoOptions,
  Clip,
  ExportOptions,
  Project,
  SettingsUpdate
} from '@shared/types'
import { VIDEO_EXTENSIONS } from '@shared/video'
import { sizeTargetBytesFromMb } from '@shared/uploadBudget'
import { invalidateExportForClipSave, staleExportForTranscriptChange } from '@shared/exportState'
import { highlightClips } from '@shared/wholeVideo'
import { mergeClipSave, needsReframe } from '@shared/reframe'
import { analyzeProject, createProject, createProjectFromUrl } from './pipeline'
import { captionWholeVideo } from './pipeline/wholeVideo'
import { downloadGpuFfmpeg } from './pipeline/encoders'
import { probeVideo } from './pipeline/ffmpeg'
import { getTimeline } from './pipeline/timeline'
import { renderClip, type RenderJob } from './pipeline/render'
import { streamChromiumOverlayFrames } from './overlayRenderer'
import { ensureClipReframe } from './pipeline/reframe'
import { cancelBackgroundReframes, startBackgroundReframes } from './pipeline/backgroundReframe'
import { generateSocialCaption } from './pipeline/socialCaption'
import { addCustomFonts, listCustomFonts, removeCustomFont, renderFontsDir } from './fonts'
import { clearImportCookiesFile, installImportCookiesFile } from './cookies'
import { checkForUpdates, downloadUpdate, installUpdate, updateFromSource, getUpdateDownloadState, onUpdateDownloadState, openUpdateInstaller, cancelUpdateDownload } from './updates'
import { clipInfoCsv, clipInfoMarkdown } from './clipMetadata'
import { UpdateActivity } from './updateActivity'
import { isMediaPathAllowed } from './mediaAccess'
import { sanitizeFileName, uniqueOutputPath } from './exportPath'
import { deleteProject, listProjects, loadProject, updateProject } from './projects'
import {
  getAnalysisCredential,
  getBrandingSettings,
  getBrandVoiceSettings,
  getExportPreferences,
  getModelPreferences,
  getSettings,
  updateSettings
} from './settings'

const runningAnalyses = new Map<string, AbortController>()
const runningExports = new Map<string, AbortController>()

export const ANALYSIS_CANCELLED_MESSAGE = 'Analysis cancelled'
export const EXPORT_CANCELLED_MESSAGE = 'Export cancelled'


/** How far apart durations may be for a relinked file to count as the same video. */
const RELINK_DURATION_TOLERANCE_SEC = 2

const VIDEO_FILTERS = [{ name: 'Videos', extensions: [...VIDEO_EXTENSIONS] }]

async function pickVideoFile(sender: Electron.WebContents, title: string): Promise<string | null> {
  // Headless/CI hook (like CUTAWAN_SMOKE): skip the native dialog.
  if (process.env.CUTAWAN_SELECT_VIDEO) return process.env.CUTAWAN_SELECT_VIDEO
  const win = BrowserWindow.fromWebContents(sender)
  const result = await dialog.showOpenDialog(win!, {
    title,
    properties: ['openFile'],
    filters: VIDEO_FILTERS
  })
  return result.canceled ? null : result.filePaths[0]
}

export function registerIpcHandlers(): void {
  const activity = new UpdateActivity()
  const handle: typeof ipcMain.handle = (channel, listener) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (channel.startsWith('updates:')) return listener(event, ...args)
      return activity.run(() => listener(event, ...args))
    })
  }
  onUpdateDownloadState((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('update:state', state)
    }
  })
  handle('dialog:selectVideo', async (event) => {
    return pickVideoFile(event.sender, 'Choose a video')
  })

  handle('dialog:selectDirectory', async (event) => {
    // Headless/CI hook (like CUTAWAN_SMOKE): skip the native dialog.
    if (process.env.CUTAWAN_EXPORT_DIR) return process.env.CUTAWAN_EXPORT_DIR
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose export folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle('project:create', async (_e, videoPath: string) => {
    return createProject(videoPath)
  })

  handle('project:createFromUrl', async (event, url: string) => {
    return createProjectFromUrl(url, (p) => {
      if (!event.sender.isDestroyed()) event.sender.send('import:progress', p)
    })
  })

  handle('project:analyze', async (event, projectId: string, options: AnalyzeOptions) => {
    if (runningAnalyses.has(projectId)) {
      throw new Error('This project is already being analyzed.')
    }
    const controller = new AbortController()
    runningAnalyses.set(projectId, controller)
    cancelBackgroundReframes(projectId)
    try {
      const project = await loadProject(projectId)
      if (project.sourceMissing) {
        throw new Error(
          `The source video is missing (${project.video.path}). Relink it before generating clips.`
        )
      }
      const analysed = await analyzeProject(
        project,
        options,
        (p) => {
          if (!event.sender.isDestroyed()) event.sender.send('pipeline:progress', p)
        },
        controller.signal
      )
      // Show the clips now; the top clips' layouts finish in the background.
      void startBackgroundReframes(analysed, (state) => {
        if (!event.sender.isDestroyed()) event.sender.send('clip:backgroundReframe', state)
      })
      return analysed
    } catch (err) {
      if (controller.signal.aborted) throw new Error(ANALYSIS_CANCELLED_MESSAGE, { cause: err })
      throw err
    } finally {
      runningAnalyses.delete(projectId)
    }
  })

  handle(
    'project:captionWholeVideo',
    async (event, projectId: string, options: CaptionVideoOptions) => {
      // Shares the analysis lock and cancel path: both flows own the same
      // project and neither may run while the other is transcribing it.
      if (runningAnalyses.has(projectId)) {
        throw new Error('This project is already being processed.')
      }
      const controller = new AbortController()
      runningAnalyses.set(projectId, controller)
      cancelBackgroundReframes(projectId)
      try {
        const project = await loadProject(projectId)
        if (project.sourceMissing) {
          throw new Error(
            `The source video is missing (${project.video.path}). Relink it before captioning.`
          )
        }
        return await captionWholeVideo(
          project,
          options,
          (p) => {
            if (!event.sender.isDestroyed()) event.sender.send('pipeline:progress', p)
          },
          controller.signal
        )
      } catch (err) {
        if (controller.signal.aborted) throw new Error(ANALYSIS_CANCELLED_MESSAGE, { cause: err })
        throw err
      } finally {
        runningAnalyses.delete(projectId)
      }
    }
  )

  handle('project:cancelAnalyze', async (_e, projectId: string) => {
    runningAnalyses.get(projectId)?.abort()
  })

  handle('project:list', async () => listProjects())
  handle('project:load', async (_e, id: string) => loadProject(id))
  handle('project:exportClipInfo', async (_e, projectId: string, outputDir: string) => {
    const project = await loadProject(projectId)
    const clips = highlightClips(project)
    if (clips.length === 0) throw new Error('No detected clips to export.')
    await mkdir(outputDir, { recursive: true })
    const markdownPath = join(outputDir, 'cutawan-clip-info.md')
    const csvPath = join(outputDir, 'cutawan-clip-info.csv')
    await Promise.all([
      writeFile(markdownPath, clipInfoMarkdown(clips), 'utf8'),
      writeFile(csvPath, clipInfoCsv(clips), 'utf8')
    ])
    return { markdownPath, csvPath }
  })
  handle('project:delete', async (_e, id: string) => {
    cancelBackgroundReframes(id)
    return deleteProject(id)
  })

  handle('project:updateClip', async (_e, projectId: string, clip: Clip) => {
    return updateProject(projectId, (project) => {
      const idx = project.clips.findIndex((c) => c.id === clip.id)
      if (idx === -1) throw new Error('Clip not found')
      const saved = project.clips[idx]
      // The renderer may save a copy it took before a lazy reframe analysis
      // landed on disk. The analysis result belongs to main: keep it rather
      // than letting the stale copy erase the focus track.
      const merged = mergeClipSave(clip, saved, project.videoType)
      project.clips[idx] = invalidateExportForClipSave(merged, saved)
    })
  })

  handle('clip:ensureReframe', async (_e, projectId: string, clipId: string, retryLayout?: boolean) => {
    return ensureClipReframe(projectId, clipId, undefined, retryLayout === true)
  })

  handle('project:rename', async (_e, projectId: string, name: string) => {
    return updateProject(projectId, (project) => {
      project.name = name.trim() || project.name
    })
  })

  handle(
    'project:updateTranscriptWord',
    async (_e, projectId: string, segmentId: number, wordIndex: number, text: string) => {
      return updateProject(projectId, (project) => {
        const segment = project.transcript?.segments.find((s) => s.id === segmentId)
        const word = segment?.words[wordIndex]
        if (!segment || !word) throw new Error('Transcript word not found')
        word.sourceText ??= word.text
        word.text = text.trim()
        segment.text = segment.words
          .map((w) => w.text)
          .filter((t) => t.length > 0)
          .join(' ')
        project.clips = project.clips.map(staleExportForTranscriptChange)
      })
    }
  )

  handle('project:relinkVideo', async (event, projectId: string) => {
    const project = await loadProject(projectId)
    const picked = await pickVideoFile(event.sender, `Locate "${project.video.fileName}"`)
    if (!picked) return project

    const video = await probeVideo(picked)
    if (Math.abs(video.durationSec - project.video.durationSec) > RELINK_DURATION_TOLERANCE_SEC) {
      throw new Error(
        `That file is ${video.durationSec.toFixed(0)}s long but this project's video was ` +
          `${project.video.durationSec.toFixed(0)}s. The transcript and clips would not line up — ` +
          'pick the same video.'
      )
    }
    cancelBackgroundReframes(projectId)
    return updateProject(projectId, (fresh) => {
      fresh.video = video
      fresh.sourceMissing = false
      fresh.sourceRevision = (fresh.sourceRevision ?? 0) + 1
      // Matching duration does not prove identical pictures or speakers.
      for (const clip of fresh.clips) clip.reframeStatus = 'pending'
    })
  })

  handle('clip:export', async (event, projectId: string, opts: ExportOptions) => {
    let project: Project = await loadProject(projectId)
    const found = project.clips.find((c) => c.id === opts.clipId)
    if (!found) throw new Error('Clip not found')
    let clip: Clip = found
    if (project.sourceMissing) {
      throw new Error(`The source video is missing (${project.video.path}). Relink it to export.`)
    }
    if (runningExports.has(clip.id)) throw new Error('This clip is already exporting.')

    const suffix = clip.edit.aspect === 'original' ? '' : ` (${clip.edit.aspect.replace(':', 'x')})`
    const previousOutputPath = clip.export?.outputPath
    const outputPath = previousOutputPath && existsSync(previousOutputPath)
      ? previousOutputPath : uniqueOutputPath(opts.outputDir, `${sanitizeFileName(clip.title)}${suffix}`)
    const prefs = getExportPreferences()
    const sizeTargetBytes = sizeTargetBytesFromMb(prefs.sizeTargetMb)
    const branding = getBrandingSettings()
    const controller = new AbortController()
    runningExports.set(clip.id, controller)
    try {
      // A clip exported straight from the grid may never have been opened,
      // so its speaker framing has not been analysed yet. Do that first: the
      // export must frame the clip the way the editor would have shown it.
      if (needsReframe(clip)) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('export:progress', { clipId: clip.id, progress: 0, message: 'Analysing framing…' })
        }
      }
      // Also join explicit retries of already-completed layouts.
      project = await ensureClipReframe(projectId, clip.id, controller.signal)
      clip = project.clips.find((c) => c.id === opts.clipId) ?? clip
      const renderBranding = {
        ...branding,
        imagePath: branding.imagePath && existsSync(branding.imagePath) ? branding.imagePath : null
      }
      const renderJob: RenderJob = {
        clip,
        source: project.video,
        transcript: project.transcript,
        outputPath,
        encoder: prefs.encoder,
        quality: prefs.quality,
        sizeTargetBytes,
        branding: renderBranding,
        fontsDirPath: await renderFontsDir(),
        signal: controller.signal,
        onProgress: (fraction) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('export:progress', { clipId: clip.id, progress: fraction, message: 'Rendering…' })
          }
        }
      }
      const hasVisualOverlay =
        (clip.edit.captionsEnabled && Boolean(project.transcript)) ||
        (clip.edit.showTitle && Boolean(clip.hook || clip.title)) ||
        clip.broll.some((item) => item.enabled && Boolean(item.imagePath)) ||
        Boolean(renderBranding.enabled && renderBranding.imagePath)
      let rendered
      if (hasVisualOverlay) {
        try {
          rendered = await renderClip({
            ...renderJob,
            visualOverlay: {
              customFonts: await listCustomFonts(),
              streamFrames: streamChromiumOverlayFrames
            }
          })
        } catch (error) {
          if (controller.signal.aborted) throw error
          console.error('Chromium overlay render failed; retrying with ASS/libass:', error)
          if (!event.sender.isDestroyed()) {
            event.sender.send('export:progress', {
              clipId: clip.id,
              progress: 0,
              message: 'High-fidelity renderer unavailable; using compatibility renderer…'
            })
          }
          rendered = await renderClip(renderJob)
        }
      } else {
        rendered = await renderClip(renderJob)
      }
      const exportState = {
        status: 'done' as const, outputPath: rendered.outputPath,
        bytes: rendered.bytes, exportedAt: Date.now()
      }
      await updateProject(projectId, (fresh) => {
        const target = fresh.clips.find((item) => item.id === clip.id)
        if (!target) throw new Error('Clip not found')
        target.export = exportState
      })
      return {
        clipId: clip.id,
        outputPath: rendered.outputPath,
        bytes: rendered.bytes,
        exportState,
        ...(sizeTargetBytes !== undefined
          ? {
              sizeTargetBytes,
              downscaled: rendered.sizePlan?.downscaled ?? false,
              overBudget: rendered.sizePlan?.overBudget ?? false
            }
          : {})
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // renderClip only writes a partial file until validation succeeds; keep any prior MP4 intact.
        throw new Error(EXPORT_CANCELLED_MESSAGE, { cause: err })
      }
      throw err
    } finally {
      runningExports.delete(clip.id)
    }
  })

  handle('clip:cancelExport', async (_e, clipId: string) => {
    runningExports.get(clipId)?.abort()
  })
  handle('clip:clearExport', async (_e, projectId: string, clipId: string) => {
    return updateProject(projectId, (project) => {
      const clip = project.clips.find((item) => item.id === clipId)
      if (!clip) throw new Error('Clip not found')
      delete clip.export
    })
  })

  handle('clip:generateCaption', async (_e, projectId: string, clipId: string) => {
    const project = await loadProject(projectId)
    const clip = project.clips.find((c) => c.id === clipId)
    if (!clip) throw new Error('Clip not found')
    const apiKey = getAnalysisCredential()
    if (!apiKey) throw new Error('Add your OpenAI API key in Settings first.')
    const caption = await generateSocialCaption(
      apiKey,
      getModelPreferences().analysisModel,
      clip,
      project.transcript,
      getBrandVoiceSettings()
    )
    // Graft only the caption under the lock: edits made while the LLM ran
    // must survive, so never save the pre-call project object.
    return updateProject(projectId, (fresh) => {
      const target = fresh.clips.find((c) => c.id === clipId)
      if (!target) throw new Error('Clip not found')
      target.caption = caption
    })
  })

  handle('video:timeline', async (_e, videoPath: string, startSec: number, endSec: number) => {
    // Same trust boundary as media://: only registered project media.
    if (!isMediaPathAllowed(videoPath)) throw new Error('Not a project video')
    return getTimeline(videoPath, startSec, endSec)
  })

  handle('settings:downloadGpuFfmpeg', async (event) => {
    return downloadGpuFfmpeg((p) => {
      if (!event.sender.isDestroyed()) event.sender.send('gpu:progress', p)
    })
  })

  handle('settings:checkSubscription', () => checkSubscriptionSetup())
  handle('settings:checkLocalWhisper', () => checkLocalWhisperSetup())
  handle('settings:installLocalWhisper', async (event, model: LocalWhisperModel, pythonPath: string) => {
    const result = await installLocalWhisper(model, pythonPath, progress => {
      if (!event.sender.isDestroyed()) event.sender.send('whisper:installProgress', progress)
    })
    await updateSettings({ subscription: { pythonPath: result.pythonPath, whisperModelPath: result.modelPath } })
    return result
  })
  handle('settings:cancelLocalWhisperInstall', () => cancelLocalWhisperInstall())
  handle('settings:get', async () => getSettings())
  handle('settings:update', async (_e, update: SettingsUpdate) => updateSettings(update))

  handle('fonts:list', async () => listCustomFonts())

  handle('fonts:add', async (event) => {
    // Headless/CI hook (like CUTAWAN_SELECT_VIDEO): skip the native dialog.
    let paths: string[]
    if (process.env.CUTAWAN_SELECT_FONTS) {
      paths = process.env.CUTAWAN_SELECT_FONTS.split(',')
    } else {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win!, {
        title: 'Choose font files',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }]
      })
      if (result.canceled) return listCustomFonts()
      paths = result.filePaths
    }
    return addCustomFonts(paths)
  })

  handle('fonts:remove', async (_e, fileName: string) => removeCustomFont(fileName))

  handle('cookies:import', async (event) => {
    if (process.env.CUTAWAN_COOKIES_FILE) {
      await installImportCookiesFile(process.env.CUTAWAN_COOKIES_FILE)
      return getSettings()
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import cookies file',
      properties: ['openFile'],
      filters: [{ name: 'Cookies', extensions: ['txt'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return getSettings()
    await installImportCookiesFile(result.filePaths[0])
    return getSettings()
  })

  handle('cookies:clear', async () => {
    await clearImportCookiesFile()
    return getSettings()
  })

  handle('branding:selectLogo', async (event) => {
    // Headless/CI hook: skip the native dialog.
    let picked: string | null
    if (process.env.CUTAWAN_SELECT_LOGO) {
      picked = process.env.CUTAWAN_SELECT_LOGO
    } else {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win!, {
        title: 'Choose a watermark or logo image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      })
      picked = result.canceled ? null : result.filePaths[0]
    }
    if (!picked) return getSettings()

    // Copy into userData so the logo survives the source file moving and is
    // reachable through the media:// allowlist for the preview.
    const dir = join(app.getPath('userData'), 'branding')
    await mkdir(dir, { recursive: true })
    const dest = join(dir, `logo-${Date.now()}${extname(picked).toLowerCase()}`)
    await copyFile(picked, dest)
    const previous = getBrandingSettings().imagePath
    if (previous && previous.startsWith(dir) && basename(previous) !== basename(dest)) {
      await rm(previous, { force: true }).catch(() => undefined)
    }
    return updateSettings({ branding: { imagePath: dest, enabled: true } })
  })

  handle('updates:check', async () => checkForUpdates())

  handle('updates:state', () => getUpdateDownloadState())
  handle('updates:download', () => downloadUpdate())
  handle('updates:cancel', () => cancelUpdateDownload())
  handle('updates:openInstaller', () => openUpdateInstaller())
  handle('updates:install', () => { activity.requireIdle(); installUpdate() })

  handle('updates:updateFromSource', async (event) => {
    activity.requireIdle()
    return updateFromSource((p) => {
      if (!event.sender.isDestroyed()) event.sender.send('update:sourceProgress', p)
    })
  })

  handle('shell:showItemInFolder', async (_e, path: string) => {
    shell.showItemInFolder(path)
  })
}
