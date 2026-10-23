<template>
    <svg
        :width="pixelSize"
        :height="pixelSize"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="klipper-code-icon"
        aria-hidden="true">
        <path d="M47.6 16.4A22 22 0 1 0 47.6 47.6" stroke-width="6" />
        <line x1="25" y1="22" x2="25" y2="42" stroke-width="5" />
        <polyline points="38,22 31,32 38,42" stroke-width="5" />
        <path
            d="M52 25Q53.12 30.88 59 32Q53.12 33.12 52 39Q50.88 33.12 45 32Q50.88 30.88 52 25Z"
            fill="currentColor"
            stroke="none" />
    </svg>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

const DEFAULT_SIZE = 24
const DENSE_SIZE = 20

// "C wraps K" mark, drawn with strokes in currentColor so it follows the Mainsail theme
@Component
export default class KlipperCodeIcon extends Vue {
    @Prop({ type: Number, default: null }) readonly size!: number | null
    @Prop({ type: Boolean, default: false }) readonly dense!: boolean

    get pixelSize(): number {
        return this.size ?? (this.dense ? DENSE_SIZE : DEFAULT_SIZE)
    }
}
</script>

<style scoped>
.klipper-code-icon {
    flex-shrink: 0;
}
</style>
