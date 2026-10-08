# Rivet Field for Android

`android-native/` is the installable Android companion for field teams. It opens the live Rivet Field workspace at `/tech`, reports whether Rivet is reachable, and includes a browser fallback for links outside the workspace.

## Build a debug APK

From `mobile/android-native` on Windows:

```powershell
.\gradlew.bat :app:assembleDebug --no-daemon
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

The checked-in project uses a small native Android shell rather than Expo’s generated Android project. This keeps local builds reliable on machines where the React Native NDK toolchain is unavailable. The debug APK is signed with Android’s standard debug certificate and is intended for preview installs; use a private release keystore before distributing a production build.