const IS_DEV = process.env.APP_VARIANT === "development" || !process.env.EAS_BUILD;

export default {
  expo: {
    name: "Archive Capture",
    slug: "archive-capture",
    version: "1.0.1",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    scheme: "archive-capture",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#E8EAF6",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.archivecapture.app",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#E8EAF6",
      },
      package: "com.archivecapture.app",
      permissions: [
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.RECORD_AUDIO",
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission:
            "Archive Capture needs camera access to scan documents.",
        },
      ],
      "@react-native-google-signin/google-signin",
    ],
    extra: {
      eas: {
        projectId: "f1db2c7b-0403-490f-aac0-fef9242f5de8",
      },
    },
    owner: "clshot",
    // Only set runtimeVersion and updates URL in production (EAS builds).
    // These fields break Expo Go in development.
    ...(!IS_DEV && {
      runtimeVersion: {
        policy: "appVersion",
      },
      updates: {
        url: "https://u.expo.dev/f1db2c7b-0403-490f-aac0-fef9242f5de8",
      },
    }),
  },
};
