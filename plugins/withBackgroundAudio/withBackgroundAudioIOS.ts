import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

export const withBackgroundAudioIOS: ConfigPlugin = (config) => {
  return withInfoPlist(config, (config) => {
    // Enable background audio mode
    const modes = config.modResults.UIBackgroundModes ?? [];
    if (!modes.includes('audio')) {
      modes.push('audio');
    }
    config.modResults.UIBackgroundModes = modes;

    // Microphone usage description
    config.modResults.NSMicrophoneUsageDescription =
      'This app needs microphone access to record meeting audio.';

    return config;
  });
};
