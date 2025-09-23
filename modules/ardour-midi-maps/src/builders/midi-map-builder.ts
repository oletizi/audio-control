import type { ArdourBinding, ArdourMidiMap, ArdourFunction } from '../types/ardour.js';

export interface MidiMapBuilderOptions {
  name: string;
  version?: string;
}

export interface BindingOptions {
  channel: number;
  function: string;
  action?: string;
  encoder?: boolean;
  momentary?: boolean;
  threshold?: number;
}

export interface CCBindingOptions extends BindingOptions {
  controller: number;
}

export interface NoteBindingOptions extends BindingOptions {
  note: number;
}

export class MidiMapBuilder {
  private bindings: ArdourBinding[] = [];
  private readonly name: string;
  private readonly version: string | undefined;

  constructor(options: MidiMapBuilderOptions) {
    this.name = options.name;
    this.version = options.version;
  }

  addCCBinding(options: CCBindingOptions): this {
    const binding: ArdourBinding = {
      channel: options.channel,
      ctl: options.controller,
      function: options.function,
    };

    if (options.action !== undefined) binding.action = options.action;
    if (options.encoder) binding.encoder = 'yes';
    if (options.momentary) binding.momentary = 'yes';
    if (options.threshold !== undefined) binding.threshold = options.threshold;

    this.bindings.push(binding);
    return this;
  }

  addNoteBinding(options: NoteBindingOptions): this {
    const binding: ArdourBinding = {
      channel: options.channel,
      note: options.note,
      function: options.function,
    };

    if (options.action !== undefined) binding.action = options.action;
    if (options.momentary) binding.momentary = 'yes';
    if (options.threshold !== undefined) binding.threshold = options.threshold;

    this.bindings.push(binding);
    return this;
  }

  addTransportControls(channel: number, startNote: number): this {
    const transportFunctions: ArdourFunction[] = [
      'transport-stop',
      'transport-roll',
      'toggle-rec-enable',
      'toggle-roll',
      'stop-forget',
    ];

    transportFunctions.forEach((func, index) => {
      this.addNoteBinding({
        channel,
        note: startNote + index,
        function: func,
        momentary: true,
      });
    });

    return this;
  }

  addChannelStripControls(channel: number, stripNumber: number, baseCC: number): this {
    const stripControls = [
      { cc: baseCC, func: 'track-set-gain' as ArdourFunction },
      { cc: baseCC + 1, func: 'track-set-pan' as ArdourFunction },
      { cc: baseCC + 2, func: 'track-set-send-gain' as ArdourFunction },
    ];

    stripControls.forEach(({ cc, func }) => {
      this.addCCBinding({
        channel,
        controller: cc,
        function: `${func}[${stripNumber}]`,
      });
    });

    const buttonControls = [
      { note: baseCC, func: 'toggle-track-mute' as ArdourFunction },
      { note: baseCC + 1, func: 'toggle-track-solo' as ArdourFunction },
      { note: baseCC + 2, func: 'toggle-rec-enable' as ArdourFunction },
      { note: baseCC + 3, func: 'track-select' as ArdourFunction },
    ];

    buttonControls.forEach(({ note, func }) => {
      this.addNoteBinding({
        channel,
        note,
        function: `${func}[${stripNumber}]`,
        momentary: func === 'track-select',
      });
    });

    return this;
  }

  build(): ArdourMidiMap {
    const map: ArdourMidiMap = {
      name: this.name,
      bindings: [...this.bindings],
    };

    if (this.version !== undefined) {
      map.version = this.version;
    }

    return map;
  }

  clear(): this {
    this.bindings = [];
    return this;
  }

  getBindingCount(): number {
    return this.bindings.length;
  }
}