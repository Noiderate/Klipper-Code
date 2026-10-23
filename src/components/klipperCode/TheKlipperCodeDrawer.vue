<template>
    <div>
        <v-navigation-drawer
            v-if="enabled"
            v-model="drawerOpen"
            right
            app
            clipped
            :temporary="isMobile"
            :width="drawerWidth"
            :style="drawerStyle">
            <div class="d-flex flex-column fill-height">
                <div class="d-flex align-center px-3 py-2">
                    <klipper-code-icon dense class="mr-2" />
                    <span class="subtitle-1">{{ $t('KlipperCode.Title') }}</span>
                    <v-chip x-small outlined label color="warning" class="ml-2">{{ $t('KlipperCode.Demo') }}</v-chip>
                    <v-spacer />
                    <v-btn v-if="messages.length" icon small :title="$t('KlipperCode.Clear')" @click="clear">
                        <v-icon small>{{ mdiDeleteSweepOutline }}</v-icon>
                    </v-btn>
                    <v-btn icon small :title="$t('KlipperCode.CloseChat')" @click="drawerOpen = false">
                        <v-icon small>{{ mdiChevronDoubleRight }}</v-icon>
                    </v-btn>
                </div>
                <v-divider />

                <div v-if="!isConnected" class="text-center pa-6">
                    <v-icon large class="mb-2 text--disabled">{{ mdiLinkVariantOff }}</v-icon>
                    <div class="subtitle-2 mb-1">{{ $t('KlipperCode.NoAgentConnected') }}</div>
                    <div class="body-2 text--secondary mb-4">{{ $t('KlipperCode.NoAgentConnectedDescription') }}</div>
                    <v-btn color="primary" @click="openSettings">
                        <v-icon left small>{{ mdiLinkVariant }}</v-icon>
                        {{ $t('KlipperCode.ConnectAgent') }}
                    </v-btn>
                </div>

                <template v-else>
                    <div ref="messageList" class="klipper-code-messages flex-grow-1 px-3 py-2">
                        <div v-if="!messages.length" class="text-center mt-6">
                            <klipper-code-icon :size="36" class="mb-2 text--disabled" />
                            <p class="body-2 text--secondary mb-4">{{ $t('KlipperCode.Intro') }}</p>
                            <v-chip
                                v-for="suggestion in suggestions"
                                :key="suggestion"
                                small
                                outlined
                                class="ma-1"
                                @click="send(suggestion)">
                                {{ suggestion }}
                            </v-chip>
                        </div>

                        <div
                            v-for="message in messages"
                            :key="message.id"
                            class="d-flex mb-3"
                            :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
                            <v-sheet
                                class="klipper-code-bubble body-2"
                                :class="{ 'klipper-code-bubble--assistant': message.role === 'assistant' }"
                                :color="message.role === 'user' ? 'primary' : undefined"
                                :dark="message.role === 'user'"
                                :outlined="message.role === 'assistant'"
                                rounded="lg">
                                <div class="klipper-code-bubble__text">{{ message.text }}</div>
                                <klipper-code-proposal
                                    v-if="message.proposal"
                                    :proposal="message.proposal"
                                    @apply="requestApply(message.proposal)"
                                    @discard="message.proposal.status = 'discarded'"
                                    @undo="undo(message.proposal)"
                                    @restart="showRestartDialog = true" />
                            </v-sheet>
                        </div>

                        <div v-if="loading" class="d-flex align-center caption text--secondary">
                            <v-progress-circular indeterminate size="14" width="2" class="mr-2" />
                            {{ $t('KlipperCode.Thinking') }}
                        </div>
                    </div>

                    <v-divider />
                    <div class="pa-3">
                        <v-textarea
                            v-model="prompt"
                            :placeholder="$t('KlipperCode.Placeholder')"
                            :disabled="loading"
                            outlined
                            dense
                            hide-details
                            auto-grow
                            rows="1"
                            class="body-2 klipper-code-input"
                            @keydown.enter.exact.prevent="send(prompt)">
                            <template #append>
                                <v-btn icon small :disabled="!canSend" @click="send(prompt)">
                                    <v-icon small>{{ mdiSend }}</v-icon>
                                </v-btn>
                            </template>
                        </v-textarea>
                        <klipper-code-bottom-bar class="mt-1" />
                    </div>
                </template>
            </div>
        </v-navigation-drawer>

        <v-dialog v-model="showUnsavedDialog" :max-width="500">
            <v-card>
                <v-card-title class="subtitle-1">{{ $t('KlipperCode.UnsavedEditorTitle') }}</v-card-title>
                <v-card-text>
                    {{ $t('KlipperCode.UnsavedEditorMessage', { filename: pendingFilename }) }}
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="showUnsavedDialog = false">{{ $t('KlipperCode.Cancel') }}</v-btn>
                    <v-btn text color="warning" @click="confirmOverwrite">{{ $t('KlipperCode.Overwrite') }}</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="showRestartDialog" :max-width="500">
            <v-card>
                <v-card-title class="subtitle-1">{{ $t('KlipperCode.RestartTitle') }}</v-card-title>
                <v-card-text>
                    <p class="mb-0">{{ $t('KlipperCode.RestartMessage') }}</p>
                    <p v-if="isPrinting" class="error--text mt-2 mb-0">{{ $t('KlipperCode.RestartWhilePrinting') }}</p>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="showRestartDialog = false">{{ $t('KlipperCode.Cancel') }}</v-btn>
                    <v-btn text color="primary" :disabled="isPrinting" @click="restartKlipper">
                        {{ $t('KlipperCode.RestartKlipper') }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Ref, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import KlipperCodeIcon from '@/components/klipperCode/KlipperCodeIcon.vue'
import KlipperCodeProposal from '@/components/klipperCode/KlipperCodeProposal.vue'
import KlipperCodeBottomBar from '@/components/klipperCode/KlipperCodeBottomBar.vue'
import { riskAtOrBelow } from '@/plugins/klipperCodeRisk'
import { mdiChevronDoubleRight, mdiDeleteSweepOutline, mdiLinkVariant, mdiLinkVariantOff, mdiSend } from '@mdi/js'
import {
    ChatMessage,
    FileChangeProposal,
    OPEN_SETTINGS_EVENT,
    askAssistant,
    backupConfigFile,
    klipperCodeUi,
    listConfigFiles,
    readConfigFile,
    writeConfigFile,
    AutoAcceptLevel,
} from '@/plugins/klipperCode'

const DRAWER_WIDTH = 420
// one above the editor dialog (202); menus and dialogs opened from the panel stack at 204 and up, above both
const EDITOR_Z_INDEX = 203

@Component({
    components: { KlipperCodeBottomBar, KlipperCodeIcon, KlipperCodeProposal },
})
export default class TheKlipperCodeDrawer extends Mixins(BaseMixin) {
    mdiChevronDoubleRight = mdiChevronDoubleRight
    mdiDeleteSweepOutline = mdiDeleteSweepOutline
    mdiLinkVariant = mdiLinkVariant
    mdiLinkVariantOff = mdiLinkVariantOff
    mdiSend = mdiSend

    @Ref() readonly messageList!: HTMLDivElement

    messages: ChatMessage[] = []
    prompt = ''
    loading = false
    nextId = 1
    drawerWidth = DRAWER_WIDTH
    showUnsavedDialog = false
    showRestartDialog = false
    pendingProposal: FileChangeProposal | null = null
    appBackground = ''

    get drawerOpen(): boolean {
        return klipperCodeUi.drawerOpen
    }

    set drawerOpen(newVal: boolean) {
        klipperCodeUi.drawerOpen = newVal
    }

    get editorOpen(): boolean {
        return this.$store.state.editor.bool ?? false
    }

    // the config editor is a fullscreen dialog; lift the panel above it so both stay usable
    get drawerStyle(): Record<string, string | number> {
        const background = this.appBackground ? { backgroundColor: this.appBackground } : {}
        if (!this.editorOpen) return background

        return { ...background, zIndex: EDITOR_Z_INDEX, top: 0, maxHeight: '100%', height: '100%' }
    }

    get editorFile(): string | null {
        const editor = this.$store.state.editor
        if (!editor.bool || editor.fileroot !== 'config') return null

        return [editor.filepath, editor.filename].filter(Boolean).join('/')
    }

    get enabled(): boolean {
        return this.$store.state.gui.klipperCode?.enabled ?? false
    }

    get isConnected(): boolean {
        return (this.$store.state.gui.klipperCode?.connections ?? []).length > 0
    }

    get apiUrl(): string {
        return this.$store.getters['socket/getUrl']
    }

    get canSend(): boolean {
        return this.prompt.trim() !== '' && !this.loading
    }

    get autoAccept(): AutoAcceptLevel {
        return this.$store.state.gui.klipperCode?.autoAccept ?? 'never'
    }

    get pendingFilename(): string {
        return this.pendingProposal?.filename ?? ''
    }

    get isPrinting(): boolean {
        return ['printing', 'paused'].includes(this.printer_state)
    }

    get suggestions(): string[] {
        return [
            this.$t('KlipperCode.SuggestionCheck').toString(),
            this.$t('KlipperCode.SuggestionExplain').toString(),
            this.$t('KlipperCode.SuggestionMacro').toString(),
        ]
    }

    @Watch('$vuetify.theme.dark')
    themeChanged(): void {
        this.$nextTick(this.readAppBackground)
    }

    mounted(): void {
        this.readAppBackground()
    }

    /**
     * Vuetify 2 has no CSS variable for the theme's background color, so take it from the app root.
     * It is the darkest surface in dark themes (and plain white in light themes), darker than the
     * default drawer grey, and follows whatever theme is active in Mainsail.
     */
    readAppBackground(): void {
        const app = document.querySelector('.v-application')
        if (!app) return

        this.appBackground = window.getComputedStyle(app).backgroundColor
    }

    async send(text: string): Promise<void> {
        const prompt = text.trim()
        if (prompt === '' || this.loading) return

        this.prompt = ''
        this.addMessage({ role: 'user', text: prompt })
        this.loading = true

        try {
            const files = await listConfigFiles(this.apiUrl)
            const reply = await askAssistant({
                prompt,
                files,
                activeFile: this.editorFile ?? undefined,
                readFile: (filename) => readConfigFile(this.apiUrl, filename),
            })
            const proposal: FileChangeProposal | undefined = reply.proposal
                ? { ...reply.proposal, status: 'pending' }
                : undefined
            this.addMessage({ role: 'assistant', text: reply.text, proposal })
            if (proposal && this.shouldAutoApply(proposal)) {
                proposal.autoApplied = true
                await this.apply(proposal)
            }
        } catch {
            this.addMessage({ role: 'assistant', text: this.$t('KlipperCode.Error').toString() })
        } finally {
            this.loading = false
        }
    }

    addMessage(message: Omit<ChatMessage, 'id'>): void {
        this.messages.push({ ...message, id: this.nextId++ })
        this.$nextTick(() => {
            if (this.messageList) this.messageList.scrollTop = this.messageList.scrollHeight
        })
    }

    isOpenInEditor(filename: string): boolean {
        return this.editorFile === filename
    }

    requestApply(proposal: FileChangeProposal): void {
        if (this.isOpenInEditor(proposal.filename) && this.$store.state.editor.changed) {
            this.pendingProposal = proposal
            this.showUnsavedDialog = true
            return
        }

        this.apply(proposal)
    }

    confirmOverwrite(): void {
        this.showUnsavedDialog = false
        if (this.pendingProposal) this.apply(this.pendingProposal)
        this.pendingProposal = null
    }

    async apply(proposal: FileChangeProposal): Promise<void> {
        proposal.status = 'applying'

        try {
            // refuse to overwrite changes made to the file after the proposal was created
            const current = await readConfigFile(this.apiUrl, proposal.filename)
            if (current !== proposal.baseContent) {
                proposal.status = 'stale'
                return
            }

            proposal.backupPath = await backupConfigFile(this.apiUrl, proposal.filename, current)
            await writeConfigFile(this.apiUrl, proposal.filename, proposal.newContent)
            proposal.status = 'applied'
            this.syncEditor(proposal.filename, proposal.newContent)
        } catch {
            proposal.status = 'failed'
        }
    }

    /**
     * Auto-accept never skips a question the user must answer: unsaved editor changes to the same
     * file still go through the manual Apply (and its overwrite prompt).
     */
    shouldAutoApply(proposal: FileChangeProposal): boolean {
        if (this.autoAccept === 'never') return false
        if (!riskAtOrBelow(proposal.risk, this.autoAccept)) return false

        return !(this.isOpenInEditor(proposal.filename) && this.$store.state.editor.changed)
    }

    async undo(proposal: FileChangeProposal): Promise<void> {
        if (!proposal.backupPath) return
        proposal.status = 'undoing'

        try {
            // only undo if nobody changed the file after Klipper Code saved it
            const current = await readConfigFile(this.apiUrl, proposal.filename)
            if (current !== proposal.newContent) {
                proposal.status = 'undoFailed'
                return
            }

            const backup = await readConfigFile(this.apiUrl, proposal.backupPath)
            await writeConfigFile(this.apiUrl, proposal.filename, backup)
            proposal.status = 'undone'
            this.syncEditor(proposal.filename, backup)
        } catch {
            proposal.status = 'undoFailed'
        }
    }

    syncEditor(filename: string, content: string): void {
        if (!this.isOpenInEditor(filename)) return

        this.$store.commit('editor/updateSourcecode', content)
        this.$store.commit('editor/updateLoadedHash', content)
    }

    restartKlipper(): void {
        if (this.isPrinting) return

        this.showRestartDialog = false
        const script = this.$store.getters['editor/getKlipperRestartMethod']
        this.$socket.emit('printer.gcode.script', { script })
    }

    openSettings(): void {
        this.$root.$emit(OPEN_SETTINGS_EVENT, 'klipper-code')
    }

    clear(): void {
        this.messages = []
    }
}
</script>

<style scoped>
/* Vuetify gives the append slot a fixed top margin through a very specific dense/outlined selector;
   center the send button in the field instead */
.klipper-code-input ::v-deep .v-input__append-inner {
    margin-top: 0 !important;
    align-self: center !important;
}

.klipper-code-messages {
    overflow-y: auto;
}

.klipper-code-bubble {
    max-width: 92%;
    padding: 8px 10px;
}

.klipper-code-bubble--assistant {
    width: 100%;
}

.klipper-code-bubble__text {
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
