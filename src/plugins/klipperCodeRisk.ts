import type { ChangeRisk, DiffLine } from '@/plugins/klipperCode'

/**
 * Risk of a config change, scored by fixed rules on the changed lines. The AI's own label can only
 * raise the result (see combineRisk), never lower it, so a wrong or optimistic label can't get a
 * dangerous change auto-applied.
 */

export const RISK_ORDER: ChangeRisk[] = ['low', 'medium', 'high']

// sections whose content can't damage the printer: macro text, displays, LEDs and status helpers
const LOW_RISK_SECTIONS = [
    'gcode_macro',
    'delayed_gcode',
    'display',
    'display_template',
    'display_data',
    'display_glyph',
    'menu',
    'led',
    'neopixel',
    'dotstar',
    'pca9533',
    'pca9632',
    'respond',
    'pause_resume',
    'exclude_object',
    'idle_timeout',
    'virtual_sdcard',
    'save_variables',
    'gcode_arcs',
    'force_move',
    'firmware_retraction',
]

// tuning values: a bad value gives bad prints, but not a damaged printer
const MEDIUM_RISK_KEYS = [
    'max_velocity',
    'max_accel',
    'max_accel_to_decel',
    'minimum_cruise_ratio',
    'square_corner_velocity',
    'max_z_velocity',
    'max_z_accel',
    'homing_speed',
    'second_homing_speed',
    'speed',
    'z_speed',
    'lift_speed',
    'horizontal_move_z',
    'retract_length',
    'retract_speed',
    'unretract_extra_length',
    'unretract_speed',
    'pressure_advance',
    'pressure_advance_smooth_time',
    'shaper_type',
    'shaper_type_x',
    'shaper_type_y',
    'shaper_freq_x',
    'shaper_freq_y',
    'damping_ratio_x',
    'damping_ratio_y',
    'max_extrude_cross_section',
    'max_extrude_only_velocity',
    'max_extrude_only_accel',
    'instantaneous_corner_velocity',
    'fan_speed',
    'mesh_min',
    'mesh_max',
    'probe_count',
]

// wiring, safety limits, motion geometry and motor power
const HIGH_RISK_KEY_PATTERNS = [
    /_pin$/,
    /^pin$/,
    /endstop/,
    /^position_(min|max)$/,
    /^(min|max)_temp$/,
    /^(min|max)_extrude_temp$/,
    /^sensor_/,
    /^heater/,
    /^control$/,
    /^pid_/,
    /^max_power$/,
    /^(run|hold|home)_current$/,
    /^sense_resistor$/,
    /^kinematics$/,
    /^z_offset$/,
    /^rotation_distance$/,
    /^microsteps$/,
    /^full_steps_per_rotation$/,
    /^gear_ratio$/,
    /^serial$/,
    /^canbus_uuid$/,
    /^restart_method$/,
    /^uart_/,
    /^spi_/,
    /^i2c_/,
    /^x_offset$/,
    /^y_offset$/,
]

const SAVE_CONFIG_PREFIX = '#*#'

interface LineContext {
    section: string
    key: string
    inSaveConfig: boolean
}

function sectionType(section: string): string {
    return section.trim().split(/\s+/)[0].toLowerCase()
}

function readHeader(text: string): string | null {
    const match = text.match(/^\s*\[([^\]]+)\]/)
    return match ? match[1] : null
}

function readKey(text: string): string | null {
    if (/^\s/.test(text)) return null
    const match = text.match(/^([A-Za-z0-9_]+)\s*[:=]/)
    return match ? match[1].toLowerCase() : null
}

function isCommentOrBlank(text: string): boolean {
    const trimmed = text.trim()
    return trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')
}

function updateContext(context: LineContext, text: string): void {
    if (text.startsWith(SAVE_CONFIG_PREFIX)) {
        context.inSaveConfig = true
        return
    }

    const header = readHeader(text)
    if (header !== null) {
        context.section = header
        context.key = ''
        return
    }

    const key = readKey(text)
    if (key !== null) context.key = key
}

function riskOfLine(text: string, context: LineContext): ChangeRisk {
    if (context.inSaveConfig || text.startsWith(SAVE_CONFIG_PREFIX)) return 'high'
    if (isCommentOrBlank(text)) return 'low'

    const header = readHeader(text)
    const section = header ?? context.section
    const type = sectionType(section)
    if (LOW_RISK_SECTIONS.includes(type)) return 'low'
    if (header !== null || section === '') return 'high'

    const key = context.key
    if (HIGH_RISK_KEY_PATTERNS.some((pattern) => pattern.test(key))) return 'high'
    if (MEDIUM_RISK_KEYS.includes(key)) return 'medium'

    // unknown section or setting: assume the worst
    return 'high'
}

export function maxRisk(a: ChangeRisk, b: ChangeRisk): ChangeRisk {
    return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b
}

export function riskAtOrBelow(risk: ChangeRisk, limit: ChangeRisk): boolean {
    return RISK_ORDER.indexOf(risk) <= RISK_ORDER.indexOf(limit)
}

/**
 * Walks the diff while tracking which section and setting each line belongs to, separately for the
 * old file (removed lines) and the new file (added lines), and returns the highest risk found.
 */
export function scoreChangeRisk(diff: DiffLine[]): ChangeRisk {
    const oldContext: LineContext = { section: '', key: '', inSaveConfig: false }
    const newContext: LineContext = { section: '', key: '', inSaveConfig: false }
    let risk: ChangeRisk = 'low'

    for (const line of diff) {
        if (line.type === 'same') {
            updateContext(oldContext, line.text)
            updateContext(newContext, line.text)
            continue
        }

        const context = line.type === 'removed' ? oldContext : newContext
        updateContext(context, line.text)
        risk = maxRisk(risk, riskOfLine(line.text, context))
        if (risk === 'high') return risk
    }

    return risk
}

export function combineRisk(scored: ChangeRisk, aiLabel?: ChangeRisk): ChangeRisk {
    return aiLabel ? maxRisk(scored, aiLabel) : scored
}
