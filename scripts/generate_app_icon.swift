import AppKit

let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

guard let context = NSGraphicsContext.current?.cgContext else { fatalError("Missing graphics context") }

let colorSpace = CGColorSpaceCreateDeviceRGB()
let background = CGGradient(
    colorsSpace: colorSpace,
    colors: [
        NSColor(red: 0.018, green: 0.024, blue: 0.050, alpha: 1).cgColor,
        NSColor(red: 0.060, green: 0.030, blue: 0.105, alpha: 1).cgColor,
        NSColor(red: 0.020, green: 0.075, blue: 0.105, alpha: 1).cgColor
    ] as CFArray,
    locations: [0, 0.52, 1]
)!
context.drawLinearGradient(
    background,
    start: CGPoint(x: 0, y: size),
    end: CGPoint(x: size, y: 0),
    options: []
)

func radialGlow(center: CGPoint, radius: CGFloat, color: NSColor, alpha: CGFloat) {
    let gradient = CGGradient(
        colorsSpace: colorSpace,
        colors: [color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(0).cgColor] as CFArray,
        locations: [0, 1]
    )!
    context.drawRadialGradient(
        gradient,
        startCenter: center,
        startRadius: 0,
        endCenter: center,
        endRadius: radius,
        options: [.drawsAfterEndLocation]
    )
}

let center = CGPoint(x: 512, y: 512)
radialGlow(center: center, radius: 390, color: NSColor(red: 0.57, green: 0.42, blue: 1, alpha: 1), alpha: 0.30)

let orbRect = CGRect(x: 247, y: 247, width: 530, height: 530)
context.saveGState()
context.addEllipse(in: orbRect)
context.clip()

let orbGradient = CGGradient(
    colorsSpace: colorSpace,
    colors: [
        NSColor(red: 0.20, green: 0.66, blue: 1, alpha: 1).cgColor,
        NSColor(red: 0.57, green: 0.42, blue: 1, alpha: 1).cgColor,
        NSColor(red: 0.28, green: 0.94, blue: 0.72, alpha: 1).cgColor
    ] as CFArray,
    locations: [0, 0.50, 1]
)!
context.drawLinearGradient(
    orbGradient,
    start: CGPoint(x: orbRect.minX, y: orbRect.maxY),
    end: CGPoint(x: orbRect.maxX, y: orbRect.minY),
    options: []
)

radialGlow(
    center: CGPoint(x: 420, y: 640),
    radius: 250,
    color: .white,
    alpha: 0.34
)
radialGlow(
    center: CGPoint(x: 670, y: 395),
    radius: 210,
    color: NSColor(red: 0.28, green: 0.94, blue: 0.72, alpha: 1),
    alpha: 0.22
)
context.restoreGState()

context.setStrokeColor(NSColor.white.withAlphaComponent(0.20).cgColor)
context.setLineWidth(3)
context.strokeEllipse(in: orbRect.insetBy(dx: 2, dy: 2))

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode icon")
}

let destination = CommandLine.arguments.dropFirst().first ?? "Monday-1024.png"
try png.write(to: URL(fileURLWithPath: destination), options: .atomic)
