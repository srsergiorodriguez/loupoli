fn main() {
  let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
  if target_os == "macos" || target_os == "ios" {
    cc::Build::new()
      .file("native/mp4_writer.m")
      .flag("-fobjc-arc")
      .compile("loupoli_mp4_writer");
    for framework in [
      "AVFoundation",
      "CoreMedia",
      "CoreVideo",
      "CoreGraphics",
      "ImageIO",
      "Foundation",
    ] {
      println!("cargo:rustc-link-lib=framework={framework}");
    }
    println!("cargo:rerun-if-changed=native/mp4_writer.m");
  }
  tauri_build::build()
}
