import { spawn } from 'node:child_process'
import type { Writable } from 'node:stream'
import { mediaThreads } from './mediaJobs'

export interface PipeRunOptions {
  onProgress?: (outTimeSec: number) => void
  signal?: AbortSignal
}

/** Runs FFmpeg with a producer writing an image2pipe stream to descriptor 3. */
export async function runFfmpegWithFrames(
  bin: string,
  args: string[],
  produce: (stream: Writable) => Promise<void>,
  opts: PipeRunOptions = {}
): Promise<string> {
  const threads = String(mediaThreads())
  const fullArgs = [
    '-hide_banner', '-y', '-threads', threads, '-filter_threads', threads,
    '-filter_complex_threads', threads, ...args
  ]
  if (opts.onProgress) fullArgs.push('-progress', 'pipe:1', '-nostats')
  const child = spawn(bin, fullArgs, {
    windowsHide: true,
    signal: opts.signal,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe']
  })
  const frameStream = child.stdio[3] as Writable
  let stdout = ''
  let stderr = ''
  let processError: Error | undefined
  child.stdout!.on('data', (data: Buffer) => {
    stdout += data.toString()
    if (!opts.onProgress) return
    const matches = stdout.match(/out_time_ms=(\d+)/g)
    if (matches?.length) {
      const last = matches[matches.length - 1]
      opts.onProgress(Number(last.slice('out_time_ms='.length)) / 1_000_000)
      if (stdout.length > 65536) stdout = stdout.slice(-8192)
    }
  })
  child.stderr!.on('data', (data: Buffer) => {
    stderr += data.toString()
    if (stderr.length > 131072) stderr = stderr.slice(-65536)
  })
  const exit = new Promise<number>((resolve) => {
    child.on('error', (error) => { processError = error })
    child.on('close', (code) => resolve(code ?? -1))
  })

  let producerError: unknown
  const producer = produce(frameStream)
    .catch((error) => {
      producerError = error
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    })
    .finally(() => frameStream.end())

  const code = await exit
  await producer
  if (producerError) throw producerError
  if (processError) throw processError
  if (code !== 0) {
    throw new Error(`${bin.split(/[\\/]/).pop()} exited with code ${code}:\n${stderr.slice(-2000)}`)
  }
  return stdout
}
