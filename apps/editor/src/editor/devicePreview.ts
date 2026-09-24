import type { ResizeMode, SceneSettings } from '@pxe/schema';
import { ResolutionManager } from '@pxe/runtime';
import type { DeviceTransform } from './viewport';

/**
 * Device preview: simulates the *runtime screen* only.
 *
 * It never touches `designWidth` / `designHeight`.
 */
export interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const designDeviceId = 'design';

export const devicePresets: DevicePreset[] = [
  { id: 'design', label: 'Design', width: 0, height: 0 },
  { id: 'iphone-x', label: '375 × 812', width: 375, height: 812 },
  { id: 'iphone-14', label: '390 × 844', width: 390, height: 844 },
  { id: 'iphone-plus', label: '414 × 896', width: 414, height: 896 },
  { id: 'iphone-pro-max', label: '430 × 932', width: 430, height: 932 },
  { id: 'android-tall', label: 'Android Tall', width: 412, height: 915 },
  { id: '16-9', label: '16:9', width: 1920, height: 1080 },
  { id: '19.5-9', label: '19.5:9', width: 2532, height: 1170 },
  { id: 'custom', label: 'Custom', width: 0, height: 0 },
];

export function getDevicePreset(id: string): DevicePreset {
  return devicePresets.find((preset) => preset.id === id) ?? devicePresets[0]!;
}

export interface DevicePreviewResult {
  /** Simulated runtime screen size (device pixels). */
  screenWidth: number;
  screenHeight: number;
  /** Design → simulated screen mapping. */
  transform: DeviceTransform;
  /** Whether a device frame is drawn at all (`Design` mode). */
  active: boolean;
  resolution: ResolutionManager;
}

export function computeDevicePreview(
  settings: SceneSettings,
  device: DevicePreset,
  resizeMode: ResizeMode = settings.resizeMode,
): DevicePreviewResult {
  const active = device.id !== designDeviceId && device.width > 0 && device.height > 0;
  const screenWidth = active ? device.width : settings.designWidth;
  const screenHeight = active ? device.height : settings.designHeight;
  const resolution = new ResolutionManager(settings.designWidth, settings.designHeight, resizeMode);
  resolution.resize(screenWidth, screenHeight);

  return {
    screenWidth,
    screenHeight,
    active,
    resolution,
    transform: {
      scaleX: resolution.scaleX,
      scaleY: resolution.scaleY,
      offsetX: resolution.offsetX,
      offsetY: resolution.offsetY,
    },
  };
}
