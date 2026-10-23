<template>
    <v-card outlined class="mt-2">
        <div class="d-flex align-center px-2 pt-2">
            <v-icon small class="mr-1">{{ mdiFileDocumentEditOutline }}</v-icon>
            <span class="subtitle-2 text-truncate klipper-code-proposal__filename">{{ proposal.filename }}</span>
            <v-spacer />
            <v-chip small outlined label class="flex-shrink-0 ml-1" :color="riskColor">
                <v-icon left small>{{ riskIcon }}</v-icon>
                {{ $t(`KlipperCode.Risk.${proposal.risk}`) }}
            </v-chip>
        </div>
        <div class="caption text--secondary px-2 pb-2">{{ proposal.summary }}</div>
        <v-divider />
        <div class="klipper-code-diff">
            <template v-for="(line, index) in diff">
                <div v-if="line === null" :key="index" class="klipper-code-diff__gap">⋯</div>
                <div
                    v-else
                    :key="index"
                    class="klipper-code-diff__line"
                    :class="`klipper-code-diff__line--${line.type}`">
                    {{ diffPrefix(line.type) }} {{ line.text }}
                </div>
            </template>
        </div>
        <v-divider />

        <template v-if="proposal.status === 'pending'">
            <div v-if="isHighRisk" class="px-2 pt-2">
                <v-checkbox
                    v-model="highRiskConfirmed"
                    dense
                    hide-details
                    class="mt-0"
                    color="error"
                    :label="$t('KlipperCode.HighRiskConfirm')" />
            </div>
            <v-card-actions class="py-1">
                <v-spacer />
                <v-btn small text @click="$emit('discard')">{{ $t('KlipperCode.Discard') }}</v-btn>
                <v-btn
                    small
                    text
                    :color="isHighRisk ? 'error' : 'primary'"
                    :disabled="!canApply"
                    @click="$emit('apply')">
                    <v-icon left small>{{ mdiCheck }}</v-icon>
                    {{ isHighRisk ? $t('KlipperCode.ApplyAnyway') : $t('KlipperCode.Apply') }}
                </v-btn>
            </v-card-actions>
        </template>
        <div v-else-if="isBusy" class="d-flex align-center caption text--secondary pa-2">
            <v-progress-circular indeterminate size="14" width="2" class="mr-2" />
            {{ statusLabel }}
        </div>
        <div v-else-if="isSaved" class="pa-2">
            <div class="caption">
                <v-icon small :color="proposal.status === 'applied' ? 'success' : undefined" class="mr-1">
                    {{ proposal.status === 'applied' ? mdiCheckCircle : mdiUndo }}
                </v-icon>
                {{ savedLabel }}
            </div>
            <div v-if="proposal.status === 'applied'" class="caption text--secondary">
                {{ $t('KlipperCode.BackupAt', { path: proposal.backupPath }) }}
            </div>
            <div class="d-flex flex-wrap mt-2">
                <v-btn v-if="restartRequired" small outlined color="primary" class="mr-2" @click="$emit('restart')">
                    <v-icon left small>{{ mdiRestart }}</v-icon>
                    {{ $t('KlipperCode.RestartKlipper') }}
                </v-btn>
                <v-btn v-if="proposal.status === 'applied'" small text @click="$emit('undo')">
                    <v-icon left small>{{ mdiUndo }}</v-icon>
                    {{ $t('KlipperCode.Undo') }}
                </v-btn>
            </div>
        </div>
        <div v-else class="caption text--secondary pa-2">{{ statusLabel }}</div>
    </v-card>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    mdiAlert,
    mdiAlertOctagon,
    mdiCheck,
    mdiCheckCircle,
    mdiFileDocumentEditOutline,
    mdiRestart,
    mdiShieldCheck,
    mdiUndo,
} from '@mdi/js'
import {
    DiffLine,
    DiffLineType,
    FileChangeProposal,
    collapseDiff,
    diffLines,
    requiresKlipperRestart,
} from '@/plugins/klipperCode'

const RISK_STYLES = {
    low: { color: 'success', icon: mdiShieldCheck },
    medium: { color: 'warning', icon: mdiAlert },
    high: { color: 'error', icon: mdiAlertOctagon },
}

@Component
export default class KlipperCodeProposal extends Mixins(BaseMixin) {
    mdiCheck = mdiCheck
    mdiCheckCircle = mdiCheckCircle
    mdiFileDocumentEditOutline = mdiFileDocumentEditOutline
    mdiRestart = mdiRestart
    mdiUndo = mdiUndo

    @Prop({ type: Object, required: true }) readonly proposal!: FileChangeProposal

    highRiskConfirmed = false

    get diff(): (DiffLine | null)[] {
        return collapseDiff(diffLines(this.proposal.baseContent, this.proposal.newContent))
    }

    get riskColor(): string {
        return RISK_STYLES[this.proposal.risk].color
    }

    get riskIcon(): string {
        return RISK_STYLES[this.proposal.risk].icon
    }

    get isHighRisk(): boolean {
        return this.proposal.risk === 'high'
    }

    get canApply(): boolean {
        return !this.isHighRisk || this.highRiskConfirmed
    }

    get restartRequired(): boolean {
        return requiresKlipperRestart(this.proposal.filename)
    }

    get isBusy(): boolean {
        return ['applying', 'undoing'].includes(this.proposal.status)
    }

    get isSaved(): boolean {
        return ['applied', 'undone'].includes(this.proposal.status)
    }

    get savedLabel(): string {
        if (this.proposal.status === 'undone') {
            return this.$t('KlipperCode.Undone', { filename: this.proposal.filename }).toString()
        }
        if (this.proposal.autoApplied) {
            return this.$t('KlipperCode.AutoApplied', {
                filename: this.proposal.filename,
                risk: this.$t(`KlipperCode.Risk.${this.proposal.risk}`),
            }).toString()
        }

        return this.$t('KlipperCode.Saved', { filename: this.proposal.filename }).toString()
    }

    get statusLabel(): string {
        return this.$t(`KlipperCode.Status.${this.proposal.status}`).toString()
    }

    diffPrefix(type: DiffLineType): string {
        if (type === 'added') return '+'
        if (type === 'removed') return '-'
        return ' '
    }
}
</script>

<style scoped>
.klipper-code-proposal__filename {
    min-width: 0;
}

.klipper-code-diff {
    font-family: monospace;
    font-size: 12px;
    max-height: 260px;
    overflow: auto;
}

.klipper-code-diff__line {
    white-space: pre;
    padding: 0 8px;
}

.klipper-code-diff__line--added {
    background: color-mix(in srgb, var(--v-success-base) 12%, transparent);
}

.klipper-code-diff__line--removed {
    background: color-mix(in srgb, var(--v-error-base) 12%, transparent);
}

.klipper-code-diff__gap {
    padding: 0 8px;
    opacity: 0.5;
}
</style>
