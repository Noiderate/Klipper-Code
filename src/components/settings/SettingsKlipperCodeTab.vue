<template>
    <div>
        <v-card flat>
            <v-card-text>
                <settings-row
                    :title="$t('Settings.KlipperCodeTab.Enable')"
                    :sub-title="$t('Settings.KlipperCodeTab.EnableDescription')"
                    :dynamic-slot-width="true">
                    <v-switch v-model="enabled" hide-details class="mt-0" />
                </settings-row>
                <v-divider class="my-2" />
                <settings-row :title="$t('Settings.KlipperCodeTab.Provider')">
                    <v-select v-model="provider" :items="providers" :disabled="!enabled" hide-details outlined dense />
                </settings-row>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.KlipperCodeTab.Model')"
                    :sub-title="$t('Settings.KlipperCodeTab.ModelDescription')">
                    <v-text-field
                        v-model="model"
                        :placeholder="$t('Settings.KlipperCodeTab.ModelPlaceholder')"
                        :disabled="!enabled"
                        hide-details
                        outlined
                        dense />
                </settings-row>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.KlipperCodeTab.ApiKey')"
                    :sub-title="$t('Settings.KlipperCodeTab.ApiKeyDescription', { provider: providerName(provider) })">
                    <v-text-field
                        v-model="apiKey"
                        :type="showApiKey ? 'text' : 'password'"
                        :append-icon="showApiKey ? mdiEyeOff : mdiEye"
                        :disabled="!enabled || connecting"
                        :placeholder="$t('Settings.KlipperCodeTab.ApiKeyPlaceholder')"
                        autocomplete="off"
                        hide-details
                        outlined
                        dense
                        @click:append="showApiKey = !showApiKey"
                        @keydown.enter="connect" />
                    <v-btn color="primary" class="ml-2" :disabled="!canConnect" :loading="connecting" @click="connect">
                        <v-icon left small>{{ mdiLinkVariant }}</v-icon>
                        {{ $t('Settings.KlipperCodeTab.Connect') }}
                    </v-btn>
                </settings-row>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.KlipperCodeTab.Connections')"
                    :sub-title="$t('Settings.KlipperCodeTab.ConnectionsDescription')">
                    <span v-if="!connections.length" class="body-2 text--secondary">
                        {{ $t('Settings.KlipperCodeTab.NoConnections') }}
                    </span>
                </settings-row>
                <v-list v-if="connections.length" dense class="py-0">
                    <v-list-item v-for="connection in connections" :key="connection.provider" class="px-0">
                        <v-list-item-icon class="mr-3">
                            <v-icon color="success">{{ mdiCheckCircle }}</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title>{{ providerName(connection.provider) }}</v-list-item-title>
                            <v-list-item-subtitle>
                                {{ $t('Settings.KlipperCodeTab.KeyEndingIn', { hint: connection.keyHint }) }}
                                · {{ formatConnectedAt(connection.connectedAt) }}
                            </v-list-item-subtitle>
                        </v-list-item-content>
                        <v-list-item-action>
                            <v-btn small text color="error" @click="disconnect(connection.provider)">
                                {{ $t('Settings.KlipperCodeTab.Disconnect') }}
                            </v-btn>
                        </v-list-item-action>
                    </v-list-item>
                </v-list>
                <v-divider class="my-2" />
                <settings-row
                    :title="$t('Settings.KlipperCodeTab.DisconnectAll')"
                    :sub-title="$t('Settings.KlipperCodeTab.DisconnectAllDescription')">
                    <v-btn outlined color="error" :disabled="!connections.length" @click="disconnectAll">
                        <v-icon left small>{{ mdiLinkVariantOff }}</v-icon>
                        {{ $t('Settings.KlipperCodeTab.DisconnectAll') }}
                    </v-btn>
                </settings-row>
            </v-card-text>
        </v-card>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import { mdiCheckCircle, mdiEye, mdiEyeOff, mdiLinkVariant, mdiLinkVariantOff } from '@mdi/js'
import { KlipperCodeConnection, KlipperCodeProvider } from '@/store/gui/types'

const KEY_HINT_LENGTH = 4
const FAKE_CONNECT_DELAY_MS = 800

@Component({
    components: { SettingsRow },
})
export default class SettingsKlipperCodeTab extends Mixins(BaseMixin) {
    mdiCheckCircle = mdiCheckCircle
    mdiEye = mdiEye
    mdiEyeOff = mdiEyeOff
    mdiLinkVariant = mdiLinkVariant
    mdiLinkVariantOff = mdiLinkVariantOff

    apiKey = ''
    showApiKey = false
    connecting = false

    get providers() {
        const providers: KlipperCodeProvider[] = ['anthropic', 'openai', 'custom']
        return providers.map((value) => ({ text: this.providerName(value), value }))
    }

    get enabled(): boolean {
        return this.$store.state.gui.klipperCode?.enabled ?? false
    }

    set enabled(newVal: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'klipperCode.enabled', value: newVal })
    }

    get provider(): KlipperCodeProvider {
        return this.$store.state.gui.klipperCode?.provider ?? 'anthropic'
    }

    set provider(newVal: KlipperCodeProvider) {
        this.$store.dispatch('gui/saveSetting', { name: 'klipperCode.provider', value: newVal })
    }

    get model(): string {
        return this.$store.state.gui.klipperCode?.model ?? ''
    }

    set model(newVal: string) {
        this.$store.dispatch('gui/saveSetting', { name: 'klipperCode.model', value: newVal })
    }

    get connections(): KlipperCodeConnection[] {
        return this.$store.state.gui.klipperCode?.connections ?? []
    }

    get canConnect(): boolean {
        return this.enabled && this.apiKey.trim() !== '' && !this.connecting
    }

    providerName(provider: KlipperCodeProvider): string {
        return this.$t(`Settings.KlipperCodeTab.Providers.${provider}`).toString()
    }

    formatConnectedAt(timestamp: number): string {
        return this.$t('Settings.KlipperCodeTab.ConnectedAt', {
            date: new Date(timestamp).toLocaleString(),
        }).toString()
    }

    saveConnections(connections: KlipperCodeConnection[]): void {
        this.$store.dispatch('gui/saveSetting', { name: 'klipperCode.connections', value: connections })
    }

    // Connecting is simulated for now: the key is never sent anywhere or stored, only its last characters.
    connect(): void {
        if (!this.canConnect) return

        const key = this.apiKey.trim()
        const provider = this.provider
        this.connecting = true

        window.setTimeout(() => {
            const connection: KlipperCodeConnection = {
                provider,
                keyHint: key.slice(-KEY_HINT_LENGTH),
                connectedAt: Date.now(),
            }
            this.saveConnections([...this.connections.filter((c) => c.provider !== provider), connection])
            this.apiKey = ''
            this.showApiKey = false
            this.connecting = false
            this.$toast.success(
                this.$t('Settings.KlipperCodeTab.ConnectedToast', { provider: this.providerName(provider) }).toString()
            )
        }, FAKE_CONNECT_DELAY_MS)
    }

    disconnect(provider: KlipperCodeProvider): void {
        this.saveConnections(this.connections.filter((c) => c.provider !== provider))
    }

    disconnectAll(): void {
        this.saveConnections([])
        this.$toast.success(this.$t('Settings.KlipperCodeTab.DisconnectedAllToast').toString())
    }
}
</script>
