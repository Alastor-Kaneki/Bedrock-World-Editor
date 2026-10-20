plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
 namespace = "com.alastor.superflatforge"
 compileSdk = 35
 defaultConfig { applicationId = "com.alastor.superflatforge"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "Bedrock Ate The Horizon" }
 buildFeatures { compose = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
dependencies {
 implementation(platform("androidx.compose:compose-bom:2025.04.01"))
 implementation("androidx.activity:activity-compose:1.10.1")
 implementation("androidx.compose.material3:material3")
 implementation("androidx.compose.foundation:foundation")
 implementation("androidx.compose.ui:ui")
}