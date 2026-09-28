import type { RoomId } from './navigation.ts';

export class MuseumAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private oscillators: OscillatorNode[] = [];
  private enabled = false;

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled && !this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      for (const frequency of [110, 164.81, 220.12]) {
        const oscillator = this.context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(this.master);
        oscillator.start();
        this.oscillators.push(oscillator);
      }
    }
    if (!this.context || !this.master) return;
    if (enabled) await this.context.resume();
    this.master.gain.setTargetAtTime(enabled ? 0.019 : 0, this.context.currentTime, 0.3);
    this.enabled = enabled;
  }

  tune(room: RoomId): void {
    if (!this.context) return;
    const root = { atrium: 110, unfolded: 130.81, gravity: 98, recursive: 116.54 }[room];
    this.oscillators.forEach((oscillator, index) => {
      oscillator.frequency.setTargetAtTime(root * [1, 1.4983, 2.001][index], this.context!.currentTime, 0.8);
    });
  }

  async visibility(visible: boolean): Promise<void> {
    if (!this.context || !this.enabled) return;
    if (visible) await this.context.resume();
    else await this.context.suspend();
  }
}
