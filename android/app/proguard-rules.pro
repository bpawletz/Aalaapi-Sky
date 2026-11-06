# ProGuard / R8 configuration rules for Aalaapi Sky Native Android
# Keep native JavaScript interface annotations
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
