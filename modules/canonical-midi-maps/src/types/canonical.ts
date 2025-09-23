export interface CanonicalMidiMap {
  metadata: MapMetadata;
  controller: ControllerDefinition;
  plugin: PluginDefinition;
  mappings: MidiMapping[];
}

export interface MapMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  created?: string;
  updated?: string;
  tags?: string[];
}

export interface ControllerDefinition {
  manufacturer: string;
  model: string;
  version?: string;
  description?: string;
  midiChannel?: number;
  notes?: string;
}

export interface PluginDefinition {
  manufacturer: string;
  name: string;
  version?: string;
  format?: 'VST' | 'VST3' | 'AU' | 'AAX' | 'LV2' | 'CLAP';
  description?: string;
  notes?: string;
}

export interface MidiMapping {
  id: string;
  description?: string;
  midiInput: MidiInputDefinition;
  pluginTarget: PluginTargetDefinition;
  mapping?: MappingBehavior;
  enabled?: boolean;
}

export interface MidiInputDefinition {
  type: 'cc' | 'note' | 'pitchbend' | 'aftertouch' | 'program';
  channel?: number;
  number?: number;
  range?: ValueRange;
  behavior?: InputBehavior;
}

export interface PluginTargetDefinition {
  type: 'parameter' | 'bypass' | 'preset' | 'macro';
  identifier: string;
  name?: string;
  range?: ValueRange;
  units?: string;
  category?: string;
}

export interface ValueRange {
  min: number;
  max: number;
  default?: number;
}

export interface InputBehavior {
  mode?: 'absolute' | 'relative' | 'toggle' | 'momentary';
  sensitivity?: number;
  deadzone?: number;
  curve?: 'linear' | 'exponential' | 'logarithmic' | 'custom';
  invert?: boolean;
}

export interface MappingBehavior {
  scaling?: 'linear' | 'exponential' | 'logarithmic' | 'custom';
  curve?: number[];
  quantize?: number;
  smoothing?: number;
  bipolar?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}