<template>
    <v-btn
        v-if="enabled"
        icon
        tile
        class="minwidth-0"
        :class="{ 'klipper-code-button--open': isOpen }"
        :title="$t('KlipperCode.Title')"
        @click="toggle">
        <v-badge :value="isConnected" color="success" dot overlap>
            <klipper-code-icon />
        </v-badge>
    </v-btn>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import KlipperCodeIcon from '@/components/klipperCode/KlipperCodeIcon.vue'
import { klipperCodeUi } from '@/plugins/klipperCode'

@Component({
    components: { KlipperCodeIcon },
})
export default class TheKlipperCodeButton extends Mixins(BaseMixin) {
    get enabled(): boolean {
        return this.$store.state.gui.klipperCode?.enabled ?? false
    }

    get isConnected(): boolean {
        return (this.$store.state.gui.klipperCode?.connections ?? []).length > 0
    }

    get isOpen(): boolean {
        return klipperCodeUi.drawerOpen
    }

    toggle(): void {
        klipperCodeUi.drawerOpen = !klipperCodeUi.drawerOpen
    }
}
</script>

<style scoped>
.klipper-code-button--open {
    color: var(--color-logo) !important;
}
</style>
