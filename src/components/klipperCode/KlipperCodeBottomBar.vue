<template>
    <div class="klipper-code-bar d-flex align-center flex-wrap">
        <v-menu top offset-y :disabled="disabled">
            <template #activator="{ on, attrs }">
                <v-btn
                    x-small
                    text
                    class="px-1"
                    :disabled="disabled"
                    :title="disabled ? notConnectedHint : $t('KlipperCode.AutoAccept.Title')"
                    v-bind="attrs"
                    v-on="on">
                    <v-icon x-small :color="autoAcceptColor" class="mr-1">{{ autoAcceptIcon }}</v-icon>
                    <span class="klipper-code-bar__label">{{ $t(`KlipperCode.AutoAccept.Short.${autoAccept}`) }}</span>
                </v-btn>
            </template>
            <v-list dense>
                <v-subheader>{{ $t('KlipperCode.AutoAccept.Title') }}</v-subheader>
                <v-list-item-group :value="autoAccept" mandatory>
                    <v-list-item
                        v-for="level in autoAcceptLevels"
                        :key="level"
                        :value="level"
                        @click="autoAccept = level">
                        <v-list-item-icon class="mr-3">
                            <v-icon small :color="levelColor(level)">{{ levelIcon(level) }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title>{{ $t(`KlipperCode.AutoAccept.Levels.${level}`) }}</v-list-item-title>
                            <v-list-item-subtitle class="text-wrap">
                                {{ $t(`KlipperCode.AutoAccept.Descriptions.${level}`) }}
                            </v-list-item-subtitle>
                        </v-list-item-content>
                    </v-list-item>
                </v-list-item-group>
                <v-divider />
                <div class="caption text--secondary px-4 py-2">{{ $t('KlipperCode.AutoAccept.RestartNote') }}</div>
            </v-list>
        </v-menu>

        <v-spacer />

        <v-menu v-model="modelMenu" top offset-y :close-on-content-click="false" :disabled="disabled">
            <template #activator="{ on, attrs }">
                <v-btn
                    x-small
                    text
                    class="px-1"
                    :disabled="disabled"
                    :title="disabled ? notConnectedHint : $t('KlipperCode.Model.Title')"
                    v-bind="attrs"
                    v-on="on">
                    <v-icon x-small class="mr-1">{{ mdiCube }}</v-icon>
                    <span class="klipper-code-bar__label text-truncate">{{ modelLabel }}</span>
                </v-btn>
            </template>
            <v-card :min-width="260">
                <div class="d-flex align-center pl-4 pr-2 pt-2">
                    <span class="subtitle-2">{{ $t('KlipperCode.Model.Title') }}</span>
                    <v-spacer />
                    <v-btn
                        icon
                        small
                        :loading="modelList.loading"
                        :title="$t('KlipperCode.Model.Refresh')"
                        @click="refreshModels">
                        <v-icon small>{{ mdiRefresh }}</v-icon>
                    </v-btn>
                </div>
                <div v-if="modelList.error" class="px-4 pb-2">
                    <div class="caption error--text">{{ $t('KlipperCode.Model.LoadError') }}</div>
                    <v-btn x-small outlined color="error" class="mt-1" @click="refreshModels">
                        {{ $t('KlipperCode.Model.Retry') }}
                    </v-btn>
                </div>
                <v-list dense>
                    <v-list-item-group :value="model" mandatory>
                        <v-list-item value="" @click="selectModel('')">
                            <v-list-item-title>{{ $t('KlipperCode.Model.ProviderDefault') }}</v-list-item-title>
                        </v-list-item>
                        <v-list-item
                            v-for="option in modelList.models"
                            :key="option.id"
                            :value="option.id"
                            @click="selectModel(option.id)">
                            <v-list-item-content>
                                <v-list-item-title>{{ option.displayName }}</v-list-item-title>
                                <v-list-item-subtitle>{{ option.id }}</v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>
                    </v-list-item-group>
                </v-list>
                <template v-if="allowsCustomModel">
                    <v-divider />
                    <div class="d-flex align-center pa-2">
                        <v-text-field
                            v-model="customModel"
                            :placeholder="$t('KlipperCode.Model.CustomPlaceholder')"
                            outlined
                            dense
                            hide-details
                            @keydown.enter="useCustomModel" />
                        <v-btn small text color="primary" :disabled="!customModel.trim()" @click="useCustomModel">
                            {{ $t('KlipperCode.Model.Use') }}
                        </v-btn>
                    </div>
                </template>
            </v-card>
        </v-menu>

        <v-menu top offset-y :disabled="disabled">
            <template #activator="{ on, attrs }">
                <v-btn
                    x-small
                    text
                    class="px-1"
                    :disabled="disabled"
                    :title="disabled ? notConnectedHint : $t('KlipperCode.Effort.Title')"
                    v-bind="attrs"
                    v-on="on">
                    <v-icon x-small class="mr-1">{{ mdiSpeedometer }}</v-icon>
                    <span class="klipper-code-bar__label">{{ $t(`KlipperCode.Effort.Levels.${effort}`) }}</span>
                </v-btn>
            </template>
            <v-list dense>
                <v-subheader>{{ $t('KlipperCode.Effort.Title') }}</v-subheader>
                <v-list-item-group :value="effort" mandatory>
                    <v-list-item v-for="level in availableEfforts" :key="level" :value="level" @click="effort = level">
                        <v-list-item-title>{{ $t(`KlipperCode.Effort.Levels.${level}`) }}</v-list-item-title>
                    </v-list-item>
                </v-list-item-group>
            </v-list>
        </v-menu>
    </div>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import {
    mdiAlert,
    mdiAlertOctagon,
    mdiCube,
    mdiHandBackRight,
    mdiRefresh,
    mdiShieldCheck,
    mdiSpeedometer,
} from '@mdi/js'
import { AUTO_ACCEPT_LEVELS, AutoAcceptLevel } from '@/plugins/klipperCode'
import { EffortLevel, effortsForModel, loadModels, modelList, validEffort } from '@/plugins/klipperCodeModels'
import { KlipperCodeProvider } from '@/store/gui/types'

const LEVEL_STYLES: Record<AutoAcceptLevel, { color?: string; icon: string }> = {
    never: { icon: mdiHandBackRight },
    low: { color: 'success', icon: mdiShieldCheck },
    medium: { color: 'warning', icon: mdiAlert },
    high: { color: 'error', icon: mdiAlertOctagon },
}

@Component
export default class KlipperCodeBottomBar extends Mixins(BaseMixin) {
    mdiCube = mdiCube
    mdiRefresh = mdiRefresh
    mdiSpeedometer = mdiSpeedometer

    autoAcceptLevels = AUTO_ACCEPT_LEVELS
    modelList = modelList
    customModel = ''
    modelMenu = false

    get settings() {
        return this.$store.state.gui.klipperCode ?? {}
    }

    get disabled(): boolean {
        return (this.settings.connections ?? []).length === 0
    }

    get notConnectedHint(): string {
        return this.$t('KlipperCode.NoAgentConnected').toString()
    }

    get provider(): KlipperCodeProvider {
        return this.settings.provider ?? 'anthropic'
    }

    get allowsCustomModel(): boolean {
        return this.provider !== 'anthropic'
    }

    get autoAccept(): AutoAcceptLevel {
        return this.settings.autoAccept ?? 'never'
    }

    set autoAccept(newVal: AutoAcceptLevel) {
        this.$store.dispatch('gui/saveSetting', { name: 'klipperCode.autoAccept', value: newVal })
    }

    get model(): string {
        return this.settings.model ?? ''
    }

    get modelLabel(): string {
        if (this.model === '') return this.$t('KlipperCode.Model.Default').toString()

        return modelList.models.find((option) => option.id === this.model)?.displayName ?? this.model
    }

    get effort(): EffortLevel {
        return this.settings.effort ?? 'medium'
    }

    set effort(newVal: EffortLevel) {
        this.$store.dispatch('gui/saveSetting', { name: 'klipperCode.effort', value: newVal })
    }

    get availableEfforts(): EffortLevel[] {
        return effortsForModel(this.model)
    }

    get autoAcceptColor(): string | undefined {
        return this.levelColor(this.autoAccept)
    }

    get autoAcceptIcon(): string {
        return this.levelIcon(this.autoAccept)
    }

    @Watch('provider')
    providerChanged(): void {
        this.refreshModels()
    }

    @Watch('availableEfforts')
    availableEffortsChanged(efforts: EffortLevel[]): void {
        const effort = validEffort(this.effort, efforts)
        if (effort !== this.effort) this.effort = effort
    }

    mounted(): void {
        if (modelList.provider !== this.provider) this.refreshModels()
    }

    levelColor(level: AutoAcceptLevel): string | undefined {
        return LEVEL_STYLES[level].color
    }

    levelIcon(level: AutoAcceptLevel): string {
        return LEVEL_STYLES[level].icon
    }

    refreshModels(): void {
        loadModels(this.provider)
    }

    selectModel(id: string): void {
        this.$store.dispatch('gui/saveSetting', { name: 'klipperCode.model', value: id })
        this.modelMenu = false
    }

    useCustomModel(): void {
        const id = this.customModel.trim()
        if (id === '') return

        this.selectModel(id)
        this.customModel = ''
    }
}
</script>

<style scoped>
.klipper-code-bar {
    container-type: inline-size;
    gap: 2px;
}

.klipper-code-bar__label {
    max-width: 110px;
    text-transform: none;
}

/* on a narrow panel only the icons stay; the titles still show on hover */
@container (max-width: 300px) {
    .klipper-code-bar__label {
        display: none;
    }
}
</style>
