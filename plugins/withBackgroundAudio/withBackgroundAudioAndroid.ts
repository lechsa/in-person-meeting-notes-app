import { ConfigPlugin, withAndroidManifest } from 'expo/config-plugins';

export const withBackgroundAudioAndroid: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add permissions
    const permissions = [
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ];

    permissions.forEach((permission) => {
      if (
        !manifest['uses-permission']?.some(
          (p) => p.$['android:name'] === permission
        )
      ) {
        manifest['uses-permission'] = manifest['uses-permission'] || [];
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Add foreground service with microphone type
    const application = manifest.application?.[0];
    if (application) {
      application.service = application.service || [];

      // Avoid duplicates
      const serviceExists = application.service.some(
        (s) => s.$['android:name'] === '.AudioRecordingService'
      );

      if (!serviceExists) {
        application.service.push({
          $: {
            'android:name': '.AudioRecordingService',
            'android:foregroundServiceType': 'microphone',
            'android:exported': 'false',
          },
        });
      }
    }

    return config;
  });
};
