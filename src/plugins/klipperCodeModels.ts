import Vue from 'vue'
import type { KlipperCodeProvider } from '@/store/gui/types'

/**
 * Provider model service: the single place that loads the models (and the effort levels each model
 * supports) for the connected provider. It is mocked for now. The real version must call a Moonraker
 * component, which talks to the provider server side, so API keys never reach the browser.
 */

// provider-neutral effort names; the backend maps them to each provider's reasoning/thinking setting
export type EffortLevel = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const EFFORT_ORDER: EffortLevel[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
export const DEFAULT_EFFORT: EffortLevel = 'medium'
const FALLBACK_EFFORTS: EffortLevel[] = ['low', 'medium', 'high']

export interface ProviderModel {
    id: string
    displayName: string
    efforts: EffortLevel[]
}

export interface ModelListState {
    provider: KlipperCodeProvider | null
    models: ProviderModel[]
    loading: boolean
    error: boolean
}

// runtime only (not saved): reloaded whenever the panel needs it
export const modelList: ModelListState = Vue.observable({
    provider: null,
    models: [],
    loading: false,
    error: false,
})

/** Shape of one entry in Anthropic's GET /v1/models response (fields Klipper Code uses). */
interface AnthropicModel {
    id: string
    display_name: string
    capabilities: {
        effort: Record<string, { supported: boolean }>
    }
}

/** Shape of one entry in OpenAI's GET /v1/models response. Effort support is not part of it. */
interface OpenAiModel {
    id: string
}

const MOCK_DELAY_MS = 400

function anthropicEffort(supported: EffortLevel[]): Record<string, { supported: boolean }> {
    const all: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
    return Object.fromEntries(all.map((level) => [level, { supported: supported.includes(level) }]))
}

// mocked GET /v1/models; effort support varies per model so the effort filtering can be tried out
const MOCK_ANTHROPIC_MODELS: AnthropicModel[] = [
    {
        id: 'claude-fable-5-1',
        display_name: 'Fable 5.1',
        capabilities: { effort: anthropicEffort(['low', 'medium', 'high', 'xhigh', 'max']) },
    },
    {
        id: 'claude-opus-5-5',
        display_name: 'Opus 5.5',
        capabilities: { effort: anthropicEffort(['low', 'medium', 'high', 'xhigh', 'max']) },
    },
    {
        id: 'claude-sonnet-5-5',
        display_name: 'Sonnet 5.5',
        capabilities: { effort: anthropicEffort(['low', 'medium', 'high']) },
    },
    {
        id: 'claude-haiku-5-5',
        display_name: 'Haiku 5.5',
        capabilities: { effort: anthropicEffort(['low', 'medium']) },
    },
]

// placeholder IDs: the real list comes from the provider once the backend exists
const MOCK_OPENAI_MODELS: OpenAiModel[] = [{ id: 'example-reasoning-model' }, { id: 'example-basic-model' }]

// OpenAI's model list doesn't say which reasoning efforts a model takes, so keep a small editable table
const OPENAI_EFFORTS: Record<string, EffortLevel[]> = {
    'example-reasoning-model': ['minimal', 'low', 'medium', 'high'],
}

function sortEfforts(efforts: EffortLevel[]): EffortLevel[] {
    return EFFORT_ORDER.filter((level) => efforts.includes(level))
}

function fromAnthropic(models: AnthropicModel[]): ProviderModel[] {
    return models.map((model) => ({
        id: model.id,
        displayName: model.display_name,
        efforts: sortEfforts(
            Object.entries(model.capabilities.effort)
                .filter(([, value]) => value.supported)
                .map(([level]) => level as EffortLevel)
        ),
    }))
}

function fromOpenAi(models: OpenAiModel[]): ProviderModel[] {
    return models.map((model) => ({
        id: model.id,
        displayName: model.id,
        efforts: OPENAI_EFFORTS[model.id] ?? FALLBACK_EFFORTS,
    }))
}

async function fetchProviderModels(provider: KlipperCodeProvider): Promise<ProviderModel[]> {
    await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))

    if (provider === 'anthropic') return fromAnthropic(MOCK_ANTHROPIC_MODELS)
    if (provider === 'openai') return fromOpenAi(MOCK_OPENAI_MODELS)

    // custom (OpenAI-compatible) endpoints: the user types the model ID
    return []
}

export async function loadModels(provider: KlipperCodeProvider): Promise<void> {
    modelList.provider = provider
    modelList.loading = true
    modelList.error = false

    try {
        const models = await fetchProviderModels(provider)
        // ignore a late answer for a provider that was switched away from in the meantime
        if (modelList.provider === provider) modelList.models = models
    } catch {
        if (modelList.provider === provider) modelList.error = true
    } finally {
        if (modelList.provider === provider) modelList.loading = false
    }
}

/** Effort levels for a model; a typed or unknown model ID gets the safe fallback. */
export function effortsForModel(modelId: string): EffortLevel[] {
    if (modelId === '') return FALLBACK_EFFORTS

    return modelList.models.find((model) => model.id === modelId)?.efforts ?? FALLBACK_EFFORTS
}

/** Keeps the chosen effort if the model supports it, otherwise picks the closest supported level. */
export function validEffort(effort: EffortLevel, efforts: EffortLevel[]): EffortLevel {
    if (efforts.includes(effort)) return effort
    if (efforts.includes(DEFAULT_EFFORT)) return DEFAULT_EFFORT

    const wanted = EFFORT_ORDER.indexOf(effort)
    return efforts.reduce((best, level) =>
        Math.abs(EFFORT_ORDER.indexOf(level) - wanted) < Math.abs(EFFORT_ORDER.indexOf(best) - wanted) ? level : best
    )
}
