// swift-tools-version: 6.1

import PackageDescription

let package = Package(
    name: "MONDAY",
    platforms: [
        .macOS(.v15),
        .iOS(.v18),
        .watchOS(.v11)
    ],
    products: [
        .library(name: "MONDAYCore", targets: ["MONDAYCore"])
    ],
    targets: [
        .target(
            name: "MONDAYCore",
            path: "core/Sources/MONDAYCore"
        ),
        .testTarget(
            name: "MONDAYCoreTests",
            dependencies: ["MONDAYCore"],
            path: "core/Tests/MONDAYCoreTests"
        )
    ]
)
