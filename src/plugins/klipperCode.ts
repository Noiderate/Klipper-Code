import Vue from 'vue'
import axios from 'axios'
import { escapePath } from '@/plugins/helpers'
import { combineRisk, scoreChangeRisk } from '@/plugins/klipperCodeRisk'

// emitted on $root with a settings tab name to open the Interface Settings on that tab
export const OPEN_SETTINGS_EVENT = 'open-settings'

export const BACKUP_DIR = 'klipper_code_backups'

// shared between the top bar button and the drawer, which live in different parts of the app
export const klipperCodeUi = Vue.observable({ drawerOpen: false })

export type ChatRole = 'user' | 'assistant'
export type ChangeRisk = 'low' | 'medium' | 'high'
export type ProposalStatus =
    'pending' | 'applying' | 'applied' | 'discarded' | 'stale' | 'failed' | 'undoing' | 'undone' | 'undoFailed'

// highest risk that is applied without asking; 'never' means every change needs Apply
export type AutoAcceptLevel = 'never' | ChangeRisk
export const AUTO_ACCEPT_LEVELS: AutoAcceptLevel[] = ['never', 'low', 'medium', 'high']

export interface FileChangeProposal {
    filename: string
    summary: string
    risk: ChangeRisk
    // file content the proposal was made against; used for the diff and to detect changes made in the meantime
    baseContent: string
    newContent: string
    status: ProposalStatus
    backupPath?: string
    autoApplied?: boolean
}

export interface ChatMessage {
    id: number
    role: ChatRole
    text: string
    proposal?: FileChangeProposal
}

export interface AssistantRequest {
    prompt: string
    files: string[]
    // config file currently open in the editor, used when the prompt doesn't name a file
    activeFile?: string
    readFile: (filename: string) => Promise<string>
}

export interface AssistantReply {
    text: string
    // risk is the AI's own label; it is combined with the rule-based score and can only raise it
    proposal?: Omit<FileChangeProposal, 'status' | 'backupPath' | 'autoApplied'>
}

export type DiffLineType = 'same' | 'added' | 'removed'

export interface DiffLine {
    type: DiffLineType
    text: string
}

const DEMO_DELAY_MS = 600
const CONFIG_EXTENSIONS = ['.cfg', '.conf']

export function requiresKlipperRestart(filename: string): boolean {
    return filename.toLowerCase().endsWith('.cfg')
}

export async function listConfigFiles(apiUrl: string): Promise<string[]> {
    const response = await axios.get(`${apiUrl}/server/files/list`, { params: { root: 'config' } })
    const files: { path: string }[] = response.data?.result ?? []

    return files
        .map((file) => file.path)
        .filter((path) => !path.startsWith(`${BACKUP_DIR}/`))
        .filter((path) => CONFIG_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext)))
        .sort()
}

export async function readConfigFile(apiUrl: string, filename: string): Promise<string> {
    const response = await axios.get(`${apiUrl}/server/files/config/${escapePath(filename)}`, {
        params: { t: Date.now() },
        responseType: 'text',
        transformResponse: (data) => data,
    })

    return response.data
}

export async function writeConfigFile(apiUrl: string, filename: string, content: string): Promise<void> {
    const slash = filename.lastIndexOf('/')
    const formData = new FormData()
    formData.append('file', new Blob([content], { type: 'text/plain' }), filename.slice(slash + 1))
    formData.append('root', 'config')
    formData.append('path', slash === -1 ? '' : filename.slice(0, slash))

    await axios.post(`${apiUrl}/server/files/upload`, formData)
}

export async function backupConfigFile(apiUrl: string, filename: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${BACKUP_DIR}/${filename.replace(/\//g, '__')}.${timestamp}.bak`
    await writeConfigFile(apiUrl, backupPath, content)

    return backupPath
}

function pickTargetFile(prompt: string, files: string[], activeFile?: string): string | undefined {
    const lowerPrompt = prompt.toLowerCase()
    const mentioned = files.find((file) => lowerPrompt.includes(file.split('/').pop()?.toLowerCase() ?? file))
    if (mentioned) return mentioned
    if (activeFile && files.includes(activeFile)) return activeFile
    if (files.includes('printer.cfg')) return 'printer.cfg'

    return files[0]
}

interface DemoChange {
    match: RegExp
    summary: string
    section: string
    key: string
    transform: (value: string) => string
}

// demo prompts that touch real settings, so every risk level (and auto-accept level) can be tried out
const DEMO_CHANGES: DemoChange[] = [
    {
        match: /max_temp|temperature limit/i,
        summary: 'Raise the extruder max_temp by 10 °C',
        section: 'extruder',
        key: 'max_temp',
        transform: (value) => String(parseFloat(value) + 10),
    },
    {
        match: /\bpins?\b/i,
        summary: 'Invert the part cooling fan pin',
        section: 'fan',
        key: 'pin',
        transform: (value) => (value.startsWith('!') ? value.slice(1) : `!${value}`),
    },
    {
        match: /speed|accel|velocity/i,
        summary: 'Lower max_accel by 10 %',
        section: 'printer',
        key: 'max_accel',
        transform: (value) => String(Math.round(parseFloat(value) * 0.9)),
    },
]

function changeSetting(content: string, change: DemoChange): string | null {
    const lines = content.split('\n')
    let inSection = false

    for (let i = 0; i < lines.length; i++) {
        const header = lines[i].match(/^\s*\[([^\]]+)\]/)
        if (header) {
            inSection = header[1].trim().split(/\s+/)[0].toLowerCase() === change.section
            continue
        }
        if (!inSection) continue

        const setting = lines[i].match(new RegExp(`^(${change.key}\\s*[:=]\\s*)([^#;\\s]+)(.*)$`))
        if (!setting) continue

        lines[i] = `${setting[1]}${change.transform(setting[2])}${setting[3]}`
        return lines.join('\n')
    }

    return null
}

async function demoSettingChange(
    request: AssistantRequest,
    change: DemoChange,
    target: string
): Promise<{ filename: string; baseContent: string; newContent: string } | null> {
    // settings usually live in included files: look in the named file, then the files it includes,
    // then everything else (files that aren't included, like unused addons, come last)
    const targetContent = await request.readFile(target)
    const directory = target.includes('/') ? target.slice(0, target.lastIndexOf('/') + 1) : ''
    const included = [...targetContent.matchAll(/^\[include\s+([^\]]+)\]/gm)]
        .map((match) => directory + match[1].trim())
        .filter((file) => request.files.includes(file) && file !== target)
    const others = request.files.filter((file) => file !== target && !included.includes(file))
    const candidates = [target, ...included, ...others]
    for (const filename of candidates) {
        const baseContent = await request.readFile(filename)
        const newContent = changeSetting(baseContent, change)
        if (newContent !== null) return { filename, baseContent, newContent }
    }

    return null
}

function buildProposal(
    filename: string,
    summary: string,
    baseContent: string,
    newContent: string,
    aiRisk?: ChangeRisk
): Omit<FileChangeProposal, 'status'> {
    return {
        filename,
        summary,
        risk: combineRisk(scoreChangeRisk(diffLines(baseContent, newContent)), aiRisk),
        baseContent,
        newContent,
    }
}

/**
 * Placeholder until a real AI backend is connected. Prompts about max_temp, pins or speeds produce
 * high, medium and other risk examples on the real config; anything else gets a harmless comment line.
 * The demo always labels its changes 'low' so the rule-based scoring is what decides the risk.
 */
export async function askAssistant(request: AssistantRequest): Promise<AssistantReply> {
    await new Promise((resolve) => window.setTimeout(resolve, DEMO_DELAY_MS))

    const target = pickTargetFile(request.prompt, request.files, request.activeFile)
    if (!target) return { text: 'Demo mode: I could not find any config files on this printer.' }

    const demoChange = DEMO_CHANGES.find((change) => change.match.test(request.prompt))
    const settingChange = demoChange ? await demoSettingChange(request, demoChange, target) : null
    if (demoChange && settingChange) {
        return {
            text: `Demo mode: no AI is connected yet. Here is an example change to ${settingChange.filename}.`,
            proposal: buildProposal(
                settingChange.filename,
                demoChange.summary,
                settingChange.baseContent,
                settingChange.newContent,
                'low'
            ),
        }
    }

    const content = await request.readFile(target)
    const comment = `# Klipper Code demo: ${request.prompt.replace(/\s+/g, ' ').trim()}`

    return {
        text: `Demo mode: no AI is connected yet. Here is an example change to ${target} so you can try reviewing, applying and restarting. Try asking to change max_temp, a pin or the acceleration to see higher-risk changes.`,
        proposal: buildProposal(target, 'Add a comment line', content, insertBeforeSaveConfig(content, comment), 'low'),
    }
}

const SAVE_CONFIG_MARKER = '#*# <---------------------- SAVE_CONFIG ---------------------->'

/**
 * Klipper requires the auto-generated SAVE_CONFIG block to stay at the very end of printer.cfg,
 * so new lines go above it.
 */
export function insertBeforeSaveConfig(content: string, line: string): string {
    const markerIndex = content.indexOf(SAVE_CONFIG_MARKER)
    if (markerIndex === -1) {
        const separator = content.endsWith('\n') || content === '' ? '' : '\n'
        return `${content}${separator}${line}\n`
    }

    return `${content.slice(0, markerIndex)}${line}\n\n${content.slice(markerIndex)}`
}

/**
 * Line-based diff (longest common subsequence). Config files are small enough
 * that the O(n*m) table is not a concern.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
    const a = oldText.split('\n')
    const b = newText.split('\n')
    const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))

    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
        }
    }

    const result: DiffLine[] = []
    let i = 0
    let j = 0
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            result.push({ type: 'same', text: a[i] })
            i++
            j++
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            result.push({ type: 'removed', text: a[i++] })
        } else {
            result.push({ type: 'added', text: b[j++] })
        }
    }
    while (i < a.length) result.push({ type: 'removed', text: a[i++] })
    while (j < b.length) result.push({ type: 'added', text: b[j++] })

    return result
}

/**
 * Keeps only changed lines plus a little surrounding context, so a proposal for
 * a 300-line printer.cfg stays readable.
 */
export function collapseDiff(lines: DiffLine[], context = 2): (DiffLine | null)[] {
    const keep = lines.map(() => false)
    lines.forEach((line, index) => {
        if (line.type === 'same') return
        for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true
    })

    const result: (DiffLine | null)[] = []
    lines.forEach((line, index) => {
        if (keep[index]) {
            result.push(line)
            return
        }
        if (result.length === 0 || result[result.length - 1] !== null) result.push(null)
    })

    return result
}
