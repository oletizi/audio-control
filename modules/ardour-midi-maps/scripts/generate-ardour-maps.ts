#!/usr/bin/env tsx

/**
 * Generate Ardour MIDI Maps from New Canonical Template Format
 *
 * This script:
 * 1. Finds all canonical MIDI map files in the new template format
 * 2. Converts each template to Ardour XML format
 * 3. Installs them to the appropriate Ardour configuration directory
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { CanonicalMapParser } from '../../canonical-midi-maps/src/index.js';
import { MidiMapBuilder, ArdourXMLSerializer } from '../src/index.js';

interface ConversionResult {
  canonical: string;
  ardour: string;
  success: boolean;
  error?: string;
}

/**
 * Get Ardour MIDI maps directory based on OS
 */
function getArdourMidiMapsDir(): string {
  const platform = process.platform;
  const home = homedir();

  switch (platform) {
    case 'darwin': // macOS
      return join(home, 'Library', 'Preferences', 'Ardour8', 'midi_maps');
    case 'linux':
      return join(home, '.config', 'ardour8', 'midi_maps');
    case 'win32': // Windows
      return join(home, 'AppData', 'Local', 'Ardour8', 'midi_maps');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Convert template control to Ardour binding based on plugin parameter
 */
function convertControlToArdourBinding(control: any): { function?: string; uri?: string } {
  // If no plugin parameter is specified, use generic track controls
  if (!control.plugin_parameter) {
    return getGenericArdourBinding(control);
  }

  // Use URI format for plugin parameters: /route/plugin/parameter TRACK PLUGIN_SLOT PARAM_NAME
  // Use S1 (selected strip) for plugin parameters to control currently selected track
  return { uri: `/route/plugin/parameter S1 1 ${control.plugin_parameter}` };
}

/**
 * Get generic Ardour binding for controls without plugin parameters
 */
function getGenericArdourBinding(control: any): { function?: string; uri?: string } {
  const name = control.name.toLowerCase();
  const type = control.type;

  // Handle different control types and names
  if (type === 'slider') {
    if (name.includes('attack') || name.includes('a')) {
      return { function: 'track-set-send-gain[1,1]' };
    } else if (name.includes('decay') || name.includes('d')) {
      return { function: 'track-set-send-gain[1,2]' };
    } else if (name.includes('sustain') || name.includes('s')) {
      return { function: 'track-set-send-gain[1,3]' };
    } else if (name.includes('release') || name.includes('r')) {
      return { function: 'track-set-send-gain[1,4]' };
    } else if (name.includes('level') || name.includes('volume')) {
      return { function: 'track-set-gain[1]' };
    } else if (name.includes('osc') && name.includes('1')) {
      return { function: 'track-set-send-gain[1,5]' };
    } else if (name.includes('osc') && name.includes('2')) {
      return { function: 'track-set-send-gain[1,6]' };
    } else if (name.includes('osc') && name.includes('3')) {
      return { function: 'track-set-send-gain[1,7]' };
    } else if (name.includes('noise')) {
      return { function: 'track-set-send-gain[1,8]' };
    } else {
      return { function: 'track-set-trim[1]' };
    }
  } else if (type === 'encoder') {
    if (name.includes('cutoff')) {
      return { function: 'track-set-send-gain[1,1]' };
    } else if (name.includes('resonance')) {
      return { function: 'track-set-send-gain[1,2]' };
    } else if (name.includes('lfo') && name.includes('rate')) {
      return { function: 'track-set-send-gain[1,3]' };
    } else if (name.includes('glide') || name.includes('portamento')) {
      return { function: 'track-set-send-gain[1,4]' };
    } else {
      return { function: 'track-set-pan[1]' };
    }
  } else if (type === 'button') {
    if (name.includes('solo')) {
      return { function: 'track-solo[1]' };
    } else if (name.includes('mute')) {
      return { function: 'track-mute[1]' };
    } else {
      return { function: 'transport-stop' };
    }
  } else {
    // Default fallback
    return { function: 'track-select[1]' };
  }
}

/**
 * Find all canonical template files
 */
function findCanonicalTemplates(mapsDir: string): string[] {
  if (!existsSync(mapsDir)) {
    console.warn(`Maps directory not found: ${mapsDir}`);
    return [];
  }

  const templates: string[] = [];

  function scanDirectory(dir: string): void {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (extname(item) === '.yaml' || extname(item) === '.yml') {
        // Skip README and process documentation files
        if (!item.toLowerCase().includes('readme') && !item.toLowerCase().includes('process')) {
          templates.push(fullPath);
        }
      }
    }
  }

  scanDirectory(mapsDir);
  return templates;
}

/**
 * Generate Ardour filename from device info
 */
function generateArdourFilename(device: any, mapName: string): string {
  const manufacturer = device.manufacturer.toLowerCase().replace(/\\s+/g, '-');
  const model = device.model.toLowerCase().replace(/\\s+/g, '-');
  const safeName = mapName.toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `${manufacturer}-${model}-${safeName}.map`;
}

/**
 * Main conversion function
 */
async function generateArdourMaps(install: boolean = false): Promise<void> {
  console.log('🎛️  Generating Ardour MIDI Maps from Canonical Templates\\n');

  // Find canonical templates
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const mapsDir = join(__dirname, '..', '..', 'canonical-midi-maps', 'maps');
  const canonicalTemplates = findCanonicalTemplates(mapsDir);

  if (canonicalTemplates.length === 0) {
    console.log('No canonical templates found');
    return;
  }

  console.log(`Found ${canonicalTemplates.length} canonical template(s):`);
  canonicalTemplates.forEach(template => {
    console.log(`  - ${basename(template)}`);
  });
  console.log();

  // Prepare output directory
  const outputDir = join(process.cwd(), 'dist', 'ardour-maps');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Convert each template
  const results: ConversionResult[] = [];

  for (const templatePath of canonicalTemplates) {
    try {
      console.log(`Converting: ${basename(templatePath)}`);

      const yamlContent = readFileSync(templatePath, 'utf8');
      const { map, validation } = CanonicalMapParser.parseFromYAML(yamlContent);

      if (!validation.valid || !map) {
        console.error(`❌ Invalid template: ${validation.errors.map(e => e.message).join(', ')}`);
        results.push({
          canonical: basename(templatePath),
          ardour: '',
          success: false,
          error: validation.errors.map(e => e.message).join(', '),
        });
        continue;
      }

      // Create Ardour map name
      const mapName = map.plugin ?
        `${map.device.manufacturer} ${map.device.model} for ${map.plugin.name}` :
        `${map.device.manufacturer} ${map.device.model} - ${map.metadata.name}`;

      const ardourFilename = generateArdourFilename(map.device, map.metadata.name);
      const outputPath = join(outputDir, ardourFilename);

      // Add DeviceInfo for controllers with multiple channels/faders
      let deviceInfo: any = undefined;
      if (map.device.model.toLowerCase().includes('launch control xl')) {
        deviceInfo = {
          'device-name': `${map.device.manufacturer} ${map.device.model}`,
          'device-info': {
            'bank-size': 8, // 8 fader banks on Launch Control XL
          }
        };
      }

      const ardourBuilder = new MidiMapBuilder({
        name: mapName,
        version: map.version,
        deviceInfo: deviceInfo,
      });

      let totalMappings = 0;

      // Convert controls to Ardour bindings
      for (const control of map.controls) {
        // Handle regular controls (encoders, sliders, buttons)
        if (control.type !== 'button_group' && control.cc !== undefined) {
          const channel = typeof control.channel === 'string' && control.channel === 'global' ? 1 :
                          typeof control.channel === 'number' ? control.channel : 1;
          const ardourBinding = convertControlToArdourBinding(control);

          if (control.type === 'button') {
            ardourBuilder.addNoteBinding({
              channel,
              note: control.cc,
              function: ardourBinding.function,
              uri: ardourBinding.uri,
              momentary: control.mode === 'momentary',
            });
          } else {
            ardourBuilder.addCCBinding({
              channel,
              controller: control.cc,
              function: ardourBinding.function,
              uri: ardourBinding.uri,
              encoder: control.type === 'encoder',
              momentary: false,
            });
          }
          totalMappings++;
        }

        // Handle button groups
        if (control.type === 'button_group' && control.buttons) {
          for (const button of control.buttons) {
            const channel = typeof button.channel === 'string' && button.channel === 'global' ? 1 :
                            typeof button.channel === 'number' ? button.channel : 1;
            const ardourBinding = button.plugin_parameter ?
              { uri: `/route/plugin/parameter S1 1 ${button.plugin_parameter}` } :
              getGenericArdourBinding({ name: button.name, type: 'button' });

            ardourBuilder.addNoteBinding({
              channel,
              note: button.cc,
              function: ardourBinding.function,
              uri: ardourBinding.uri,
              momentary: button.mode === 'momentary',
            });
            totalMappings++;
          }
        }
      }

      // Generate XML
      const ardourMap = ardourBuilder.build();
      const serializer = new ArdourXMLSerializer();
      const ardourXML = serializer.serializeMidiMap(ardourMap);

      writeFileSync(outputPath, ardourXML);

      results.push({
        canonical: basename(templatePath),
        ardour: ardourFilename,
        success: true,
      });

      console.log(`  ✓ Generated: ${ardourFilename} (${totalMappings} mappings)`);

    } catch (error) {
      console.error(`  ❌ Failed to convert ${basename(templatePath)}: ${error}`);
      results.push({
        canonical: basename(templatePath),
        ardour: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Install to Ardour directory if requested
  if (install) {
    console.log('\\n📦 Installing to Ardour directory...');

    try {
      const ardourDir = getArdourMidiMapsDir();
      console.log(`Installing to: ${ardourDir}`);

      if (!existsSync(ardourDir)) {
        mkdirSync(ardourDir, { recursive: true });
        console.log(`Created directory: ${ardourDir}`);
      }

      let installedCount = 0;
      for (const result of results) {
        if (result.success && result.ardour) {
          const sourcePath = join(outputDir, result.ardour);
          const targetPath = join(ardourDir, result.ardour);

          const content = readFileSync(sourcePath);
          writeFileSync(targetPath, content);
          console.log(`  ✓ Installed: ${result.ardour}`);
          installedCount++;
        }
      }

      console.log(`\\n✅ Installed ${installedCount} Ardour map(s) to ${ardourDir}`);

    } catch (error) {
      console.error(`❌ Installation failed: ${error}`);
    }
  }

  // Summary
  console.log('\\n📊 Conversion Summary:');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`  ✅ Successful: ${successful}`);
  console.log(`  ❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\\nFailed conversions:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.canonical}: ${r.error}`);
    });
  }

  console.log(`\\n📁 Output directory: ${outputDir}`);
}

/**
 * CLI interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const install = args.includes('--install') || args.includes('-i');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run generate:ardour [options]

Generate Ardour MIDI maps from canonical template files.

Options:
  --install, -i    Install generated maps to Ardour configuration directory
  --help, -h       Show this help message

Examples:
  npm run generate:ardour              # Generate maps to dist/ardour-maps
  npm run generate:ardour --install    # Generate and install to Ardour
`);
    return;
  }

  try {
    await generateArdourMaps(install);
  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}