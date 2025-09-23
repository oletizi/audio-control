import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { CanonicalMidiMapSchema, type CanonicalMidiMapOutput } from '../validators/schema.js';
import type { ValidationResult } from '../types/canonical.js';

export class CanonicalMapParser {
  static parseFromYAML(yamlContent: string): { map?: CanonicalMidiMapOutput; validation: ValidationResult } {
    try {
      const rawData: unknown = parseYAML(yamlContent);
      const result = CanonicalMidiMapSchema.safeParse(rawData);

      if (result.success) {
        return {
          map: result.data,
          validation: {
            valid: true,
            errors: [],
            warnings: [],
          },
        };
      } else {
        return {
          validation: {
            valid: false,
            errors: result.error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message,
              code: err.code,
            })),
            warnings: [],
          },
        };
      }
    } catch (error) {
      return {
        validation: {
          valid: false,
          errors: [
            {
              path: 'root',
              message: error instanceof Error ? error.message : 'Unknown parsing error',
              code: 'PARSE_ERROR',
            },
          ],
          warnings: [],
        },
      };
    }
  }

  static parseFromJSON(jsonContent: string): { map?: CanonicalMidiMapOutput; validation: ValidationResult } {
    try {
      const rawData: unknown = JSON.parse(jsonContent);
      const result = CanonicalMidiMapSchema.safeParse(rawData);

      if (result.success) {
        return {
          map: result.data,
          validation: {
            valid: true,
            errors: [],
            warnings: [],
          },
        };
      } else {
        return {
          validation: {
            valid: false,
            errors: result.error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message,
              code: err.code,
            })),
            warnings: [],
          },
        };
      }
    } catch (error) {
      return {
        validation: {
          valid: false,
          errors: [
            {
              path: 'root',
              message: error instanceof Error ? error.message : 'Unknown parsing error',
              code: 'PARSE_ERROR',
            },
          ],
          warnings: [],
        },
      };
    }
  }

  static serializeToYAML(map: CanonicalMidiMapOutput): string {
    return stringifyYAML(map, {
      indent: 2,
      lineWidth: 100,
      minContentWidth: 20,
    });
  }

  static serializeToJSON(map: CanonicalMidiMapOutput, pretty = true): string {
    return JSON.stringify(map, null, pretty ? 2 : 0);
  }

  static validate(map: unknown): ValidationResult {
    const result = CanonicalMidiMapSchema.safeParse(map);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        warnings: this.generateWarnings(result.data),
      };
    } else {
      return {
        valid: false,
        errors: result.error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
        warnings: [],
      };
    }
  }

  private static generateWarnings(map: CanonicalMidiMapOutput): Array<{ path: string; message: string; code: string }> {
    const warnings: Array<{ path: string; message: string; code: string }> = [];

    // Check for duplicate MIDI inputs
    const midiInputs = new Map<string, string[]>();
    map.mappings.forEach((mapping) => {
      const key = `${mapping.midiInput.type}-${mapping.midiInput.channel || 1}-${mapping.midiInput.number || 0}`;
      if (!midiInputs.has(key)) {
        midiInputs.set(key, []);
      }
      const existingMappings = midiInputs.get(key);
      if (existingMappings) {
        existingMappings.push(mapping.id);
      }
    });

    midiInputs.forEach((mappingIds, key) => {
      if (mappingIds.length > 1) {
        warnings.push({
          path: 'mappings',
          message: `Duplicate MIDI input (${key}) used by mappings: ${mappingIds.join(', ')}`,
          code: 'DUPLICATE_MIDI_INPUT',
        });
      }
    });

    // Check for missing metadata
    if (!map.metadata.description) {
      warnings.push({
        path: 'metadata.description',
        message: 'Consider adding a description for better documentation',
        code: 'MISSING_DESCRIPTION',
      });
    }

    if (!map.metadata.author) {
      warnings.push({
        path: 'metadata.author',
        message: 'Consider adding an author for better tracking',
        code: 'MISSING_AUTHOR',
      });
    }

    return warnings;
  }
}