#!/usr/bin/env tsx

/**
 * Generate Ardour MIDI Maps from Canonical Maps
 *
 * This script:
 * 1. Finds all canonical MIDI map files
 * 2. Converts each to Ardour XML format
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

interface ArdourBinding {
  function?: string;
  uri?: string;
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
 * Convert canonical mapping to appropriate Ardour binding
 */
function convertToArdourBinding(mapping: any): ArdourBinding {
  const category = mapping.pluginTarget.category?.toLowerCase() || '';
  const name = mapping.pluginTarget.name?.toLowerCase() || '';
  const paramId = mapping.pluginTarget.identifier;

  // Handle bypass controls - these can use function syntax
  if (mapping.pluginTarget.type === 'bypass') {
    return { function: 'toggle-plugin-bypass' };
  }

  // Check if this is a plugin parameter that should use URI
  if (mapping.pluginTarget.type === 'parameter') {
    // Use Ardour URI format: /route/plugin/parameter TRACK PLUGIN_SLOT PARAM_ID
    // Use S1 (selected strip) for plugin parameters to control currently selected track
    return { uri: `/route/plugin/parameter S1 1 ${paramId}` };
  }

  // Handle global/transport controls with function syntax
  if (category.includes('global')) {
    if (name.includes('bypass')) {
      return { function: 'toggle-plugin-bypass' };
    } else if (name.includes('window')) {
      return { function: 'toggle-editor-window' };
    } else {
      return { function: 'track-select[1]' };
    }
  }

  // Default to track controls for other types
  if (category.includes('preamp') || name.includes('gain')) {
    if (name.includes('mic')) {
      return { function: 'track-set-gain[1]' };
    } else {
      return { function: 'track-set-trim[1]' };
    }
  } else if (category.includes('eq')) {
    // Map EQ bands to different sends for demonstration
    if (name.includes('low') && !name.includes('mid')) {
      return { function: 'track-set-send-gain[1,1]' };
    } else if (name.includes('low-mid') || name.includes('low mid')) {
      return { function: 'track-set-send-gain[1,2]' };
    } else if (name.includes('high-mid') || name.includes('high mid')) {
      return { function: 'track-set-send-gain[1,3]' };
    } else if (name.includes('high') && !name.includes('mid')) {
      return { function: 'track-set-send-gain[1,4]' };
    } else {
      return { function: 'track-set-send-gain[1,1]' };
    }
  } else if (category.includes('compressor') || name.includes('comp')) {
    if (name.includes('threshold')) {
      return { function: 'track-set-send-gain[1,5]' };
    } else if (name.includes('ratio')) {
      return { function: 'track-set-send-gain[1,6]' };
    } else if (name.includes('release')) {
      return { function: 'track-set-send-gain[1,7]' };
    } else {
      return { function: 'track-set-send-gain[1,8]' };
    }
  } else if (category.includes('limiter') || name.includes('limit')) {
    return { function: 'track-set-trim[1]' };
  } else if (category.includes('tape') || name.includes('tape')) {
    return { function: 'track-set-pan[1]' };
  } else if (category.includes('filter')) {
    return { function: 'track-set-send-gain[1,1]' };
  } else {
    // Generic parameter control - use URI for plugin parameters on selected strip
    return { uri: `/route/plugin/parameter S1 1 ${paramId}` };
  }
}

/**
 * Convert canonical map to Ardour format
 */
function convertCanonicalToArdour(canonicalPath: string): string {
  const yamlContent = readFileSync(canonicalPath, 'utf8');
  const { map, validation } = CanonicalMapParser.parseFromYAML(yamlContent);

  if (!validation.valid || !map) {
    throw new Error(`Invalid canonical map: ${validation.errors.map(e => e.message).join(', ')}`);
  }

  // Create descriptive map name
  const mapName = `${map.controller.manufacturer} ${map.controller.model} for ${map.plugin.name}`;

  const ardourBuilder = new MidiMapBuilder({
    name: mapName,
    version: map.metadata.version,
  });

  // Convert each mapping
  for (const mapping of map.mappings) {
    const channel = mapping.midiInput.channel || 1;
    const ardourBinding = convertToArdourBinding(mapping);

    if (mapping.midiInput.type === 'cc') {
      ardourBuilder.addCCBinding({
        channel,
        controller: mapping.midiInput.number || 0,
        function: ardourBinding.function,
        uri: ardourBinding.uri,
        encoder: mapping.midiInput.behavior?.mode === 'relative',
        momentary: false,
      });
    } else if (mapping.midiInput.type === 'note') {
      ardourBuilder.addNoteBinding({
        channel,
        note: mapping.midiInput.number || 0,
        function: ardourBinding.function,
        uri: ardourBinding.uri,
        momentary: mapping.midiInput.behavior?.mode === 'momentary',
      });
    }
  }

  const ardourMap = ardourBuilder.build();
  const serializer = new ArdourXMLSerializer();
  return serializer.serializeMidiMap(ardourMap);
}

/**
 * Find all canonical map files
 */
function findCanonicalMaps(mapsDir: string): string[] {
  if (!existsSync(mapsDir)) {
    console.warn(`Maps directory not found: ${mapsDir}`);
    return [];
  }

  const maps: string[] = [];

  function scanDirectory(dir: string): void {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (extname(item) === '.yaml' || extname(item) === '.yml') {
        maps.push(fullPath);
      }
    }
  }

  scanDirectory(mapsDir);
  return maps;
}

/**
 * Generate Ardour filename from controller info
 */
function generateArdourFilename(controller: any): string {
  const manufacturer = controller.manufacturer.toLowerCase().replace(/\s+/g, '-');
  const model = controller.model.toLowerCase().replace(/\s+/g, '-');
  return `${manufacturer}-${model}.map`;
}

/**
 * Main conversion function
 */
async function generateArdourMaps(install: boolean = false): Promise<void> {
  console.log('🎛️  Generating Ardour MIDI Maps from Canonical Maps\\n');

  // Find canonical maps
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const mapsDir = join(__dirname, '..', '..', 'canonical-midi-maps', 'maps');
  const canonicalMaps = findCanonicalMaps(mapsDir);

  if (canonicalMaps.length === 0) {
    console.log('No canonical maps found');
    return;
  }

  console.log(`Found ${canonicalMaps.length} canonical map(s):`);
  canonicalMaps.forEach(map => {
    console.log(`  - ${basename(map)}`);
  });
  console.log();

  // Group maps by controller
  const controllerGroups = new Map<string, any[]>();

  for (const canonicalPath of canonicalMaps) {
    try {
      const yamlContent = readFileSync(canonicalPath, 'utf8');
      const { map, validation } = CanonicalMapParser.parseFromYAML(yamlContent);

      if (!validation.valid || !map) {
        console.error(`❌ Invalid canonical map: ${basename(canonicalPath)}`);
        continue;
      }

      // Create controller key
      const controllerKey = `${map.controller.manufacturer}-${map.controller.model}`;

      if (!controllerGroups.has(controllerKey)) {
        controllerGroups.set(controllerKey, []);
      }

      controllerGroups.get(controllerKey)!.push({
        path: canonicalPath,
        map: map
      });

    } catch (error) {
      console.error(`❌ Failed to parse ${basename(canonicalPath)}: ${error}`);
    }
  }

  console.log(`\\nGrouped into ${controllerGroups.size} controller(s):`);
  controllerGroups.forEach((maps, controller) => {
    console.log(`  - ${controller}: ${maps.length} plugin mapping(s)`);
  });
  console.log();

  // Prepare output directory
  const outputDir = join(process.cwd(), 'dist', 'ardour-maps');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate one Ardour map per controller
  const results: ConversionResult[] = [];

  for (const [controllerKey, mapGroup] of controllerGroups) {
    try {
      console.log(`Generating Ardour map for: ${controllerKey}`);

      // Use the first map's controller info for the builder
      const firstMap = mapGroup[0].map;
      const ardourFilename = generateArdourFilename(firstMap.controller);
      const outputPath = join(outputDir, ardourFilename);

      // Create consolidated Ardour map with ALL mappings from this controller
      let deviceInfo: any = undefined;

      // Add DeviceInfo for controllers with multiple channels/faders
      if (controllerKey.includes('Launch Control XL')) {
        deviceInfo = {
          'device-name': `${firstMap.controller.manufacturer} ${firstMap.controller.model}`,
          'device-info': {
            'bank-size': 8, // 8 fader banks on Launch Control XL
          }
        };
      }

      const ardourBuilder = new MidiMapBuilder({
        name: `${firstMap.controller.manufacturer} ${firstMap.controller.model}`,
        version: '1.0.0',
        deviceInfo: deviceInfo,
      });

      let totalMappings = 0;

      // Add ALL mappings from ALL plugins for this controller
      for (const { map, path } of mapGroup) {
        console.log(`  + Adding mappings from ${basename(path)} (${map.mappings.length} mappings)`);

        for (const mapping of map.mappings) {
          const channel = mapping.midiInput.channel || 1;
          const ardourBinding = convertToArdourBinding(mapping);

          if (mapping.midiInput.type === 'cc') {
            ardourBuilder.addCCBinding({
              channel,
              controller: mapping.midiInput.number || 0,
              function: ardourBinding.function,
              uri: ardourBinding.uri,
              encoder: mapping.midiInput.behavior?.mode === 'relative',
              momentary: false,
            });
          } else if (mapping.midiInput.type === 'note') {
            ardourBuilder.addNoteBinding({
              channel,
              note: mapping.midiInput.number || 0,
              function: ardourBinding.function,
              uri: ardourBinding.uri,
              momentary: mapping.midiInput.behavior?.mode === 'momentary',
            });
          }
          totalMappings++;
        }
      }

      // Generate XML
      const ardourMap = ardourBuilder.build();
      const serializer = new ArdourXMLSerializer();
      const ardourXML = serializer.serializeMidiMap(ardourMap);

      writeFileSync(outputPath, ardourXML);

      results.push({
        canonical: `${mapGroup.length} plugin maps`,
        ardour: ardourFilename,
        success: true,
      });

      console.log(`  ✓ Generated: ${ardourFilename} (${totalMappings} total mappings)`);

    } catch (error) {
      console.error(`  ❌ Failed to generate ${controllerKey}: ${error}`);
      results.push({
        canonical: controllerKey,
        ardour: `${controllerKey}.map`,
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
        if (result.success) {
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

Generate Ardour MIDI maps from canonical map files.

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