# Repo Structure

- core/Sources/MONDAYCore/ — shared orchestration, continuity, trust, routing,
  canonical models, and specialist contracts
- core/Tests/MONDAYCoreTests/ — trust-boundary and continuity tests
- apps/MondayMac/ — native Mac presence
- apps/MondayMobile/ — adaptive native iPhone/iPad presence and CarPlay scene
- apps/MondayWatch/ — native Watch approval surface
- apps/SharedIntelligence/ — governed Foundation Models specialist shared by Mac
  and iPhone/iPad
- apps/SharedSpecialists/ — Apple specialist adapters shared across native surfaces
- apps/SharedUI/ — shared visual language for Apple screens
- schemas/ — versioned canonical action and workspace schemas
- config/ — checked-in policy defaults
- docs/ — product foundation, architecture, and capability evidence
- Package.swift — portable shared-core package and tests
- project.yml — XcodeGen source of truth for native app targets

MONDAY.xcodeproj is generated and intentionally ignored.
