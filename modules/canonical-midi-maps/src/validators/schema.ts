import { z } from 'zod';

const ValueRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  default: z.number().optional(),
});

const InputBehaviorSchema = z.object({
  mode: z.enum(['absolute', 'relative', 'toggle', 'momentary']).optional(),
  sensitivity: z.number().min(0).max(1).optional(),
  deadzone: z.number().min(0).max(1).optional(),
  curve: z.enum(['linear', 'exponential', 'logarithmic', 'custom']).optional(),
  invert: z.boolean().optional(),
});

const MappingBehaviorSchema = z.object({
  scaling: z.enum(['linear', 'exponential', 'logarithmic', 'custom']).optional(),
  curve: z.array(z.number()).optional(),
  quantize: z.number().optional(),
  smoothing: z.number().min(0).max(1).optional(),
  bipolar: z.boolean().optional(),
});

const MidiInputDefinitionSchema = z.object({
  type: z.enum(['cc', 'note', 'pitchbend', 'aftertouch', 'program']),
  channel: z.number().min(1).max(16).optional(),
  number: z.number().min(0).max(127).optional(),
  range: ValueRangeSchema.optional(),
  behavior: InputBehaviorSchema.optional(),
});

const PluginTargetDefinitionSchema = z.object({
  type: z.enum(['parameter', 'bypass', 'preset', 'macro']),
  identifier: z.string(),
  name: z.string().optional(),
  range: ValueRangeSchema.optional(),
  units: z.string().optional(),
  category: z.string().optional(),
});

const MidiMappingSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  midiInput: MidiInputDefinitionSchema,
  pluginTarget: PluginTargetDefinitionSchema,
  mapping: MappingBehaviorSchema.optional(),
  enabled: z.boolean().optional().default(true),
});

const MapMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const ControllerDefinitionSchema = z.object({
  manufacturer: z.string(),
  model: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  midiChannel: z.number().min(1).max(16).optional(),
  notes: z.string().optional(),
});

const PluginDefinitionSchema = z.object({
  manufacturer: z.string(),
  name: z.string(),
  version: z.string().optional(),
  format: z.enum(['VST', 'VST3', 'AU', 'AAX', 'LV2', 'CLAP']).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

export const CanonicalMidiMapSchema = z.object({
  metadata: MapMetadataSchema,
  controller: ControllerDefinitionSchema,
  plugin: PluginDefinitionSchema,
  mappings: z.array(MidiMappingSchema),
});

export type CanonicalMidiMapInput = z.input<typeof CanonicalMidiMapSchema>;
export type CanonicalMidiMapOutput = z.output<typeof CanonicalMidiMapSchema>;