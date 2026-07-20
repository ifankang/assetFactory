#!/usr/bin/env node
import { DEFAULT_TRACE_PARAMS } from '@vectrace/core'
import type { TraceMode, TraceParams, TraceResult } from '@vectrace/core'
import { loadImage } from '@vectrace/loader/node'
import { trace } from '@vectrace/trace'
import { traceResultToSvg } from '@vectrace/export'
import * as fs from 'fs/promises'
import * as path from 'path'

const HELP = `vectrace — bitmap to SVG tracer

Usage:
  vectrace <input> [output] [options]

Options:
  --mode <mode>              tracing mode (default: BRIGHTNESS)
                               BRIGHTNESS | BRIGHTNESS_MULTI | CANNY
                               QUANT | QUANT_COLOR | QUANT_MONO
  --turdsize <n>             speckle removal (default: 2)
  --alphamax <n>             curve smoothness (default: 1)
  --opticurve <0|1>          optimize curves (default: 1)
  --opttolerance <n>         curve optimization tolerance (default: 0.2)
  --threshold <n>            brightness threshold [0-1] (default: 0.45)
  --floor <n>                brightness floor [0-1] (default: 0)
  --canny-high <n>           canny edge threshold [0-1] (default: 0.65)
  --quant-colors <n>         quantization colors [2-256] (default: 8)
  --multiscan-colors <n>     multi-scan colors [2-256] (default: 8)
  --smooth                   apply gaussian before quantize
  --no-stack                 tile mode (not stack)
  --remove-bg                remove bottom scan
  --help / -h                show this help message
`

function parseMode(s: string): TraceMode | undefined {
  const modes: TraceMode[] = [
    'BRIGHTNESS', 'BRIGHTNESS_MULTI', 'CANNY',
    'QUANT', 'QUANT_COLOR', 'QUANT_MONO',
  ]
  return modes.find((m) => m === s)
}

function parseArgs(argv: string[]): { input: string; output: string; params: TraceParams } | null {
  const params: TraceParams = { ...DEFAULT_TRACE_PARAMS }
  let input = ''
  let output = ''

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--help' || arg === '-h') {
      console.log(HELP)
      return null
    } else if (arg === '--mode') {
      const mode = parseMode(argv[++i])
      if (!mode) {
        console.error(`Unknown mode: ${argv[i]}`)
        process.exit(1)
      }
      params.mode = mode!
    } else if (arg === '--turdsize') {
      params.turdsize = parseInt(argv[++i], 10)
    } else if (arg === '--alphamax') {
      params.alphamax = parseFloat(argv[++i])
    } else if (arg === '--opticurve') {
      params.opticurve = parseInt(argv[++i], 10)
    } else if (arg === '--opttolerance') {
      params.opttolerance = parseFloat(argv[++i])
    } else if (arg === '--threshold') {
      params.brightnessThreshold = parseFloat(argv[++i])
    } else if (arg === '--floor') {
      params.brightnessFloor = parseFloat(argv[++i])
    } else if (arg === '--canny-high') {
      params.cannyHighThreshold = parseFloat(argv[++i])
    } else if (arg === '--quant-colors') {
      params.quantizationColors = parseInt(argv[++i], 10)
    } else if (arg === '--multiscan-colors') {
      params.multiScanColors = parseInt(argv[++i], 10)
    } else if (arg === '--smooth') {
      params.multiScanSmooth = true
    } else if (arg === '--no-stack') {
      params.multiScanStack = false
    } else if (arg === '--remove-bg') {
      params.multiScanRemoveBackground = true
    } else if (arg.startsWith('-')) {
      console.error(`Unknown flag: ${arg}`)
      console.log(HELP)
      process.exit(1)
    } else if (!input) {
      input = arg
    } else if (!output) {
      output = arg
    }
  }

  if (!input) {
    console.error('Usage: vectrace <input> [output] [options]')
    console.log(HELP)
    process.exit(1)
  }

  if (!output) {
    const parsed = path.parse(input)
    output = path.join(parsed.dir, parsed.name + '.svg')
  }

  return { input, output, params }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed) return // --help

  const { input, output, params } = parsed
  const rgbMap = await loadImage(input)
  const results = await trace(rgbMap, params)
  const svg = traceResultToSvg(results, rgbMap.width, rgbMap.height)

  await fs.writeFile(output, svg, 'utf-8')

  console.log(`Written ${output}`)
}

try {
  await main()
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
}
