// swift-tools-version: 6.1

import PackageDescription

let package = Package(
  name: "TarotAIPrototype",
  platforms: [
    .iOS(.v17),
    .macOS(.v13),
  ],
  products: [
    .library(
      name: "TarotCore",
      targets: ["TarotCore"]
    ),
    .executable(
      name: "tarot-prototype",
      targets: ["TarotPrototypeCLI"]
    ),
  ],
  targets: [
    .target(
      name: "TarotCore"
    ),
    .executableTarget(
      name: "TarotPrototypeCLI",
      dependencies: ["TarotCore"]
    ),
    .testTarget(
      name: "TarotCoreTests",
      dependencies: ["TarotCore"]
    ),
  ]
)
