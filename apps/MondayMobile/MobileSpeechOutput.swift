import AVFoundation
import Foundation

@MainActor
final class MobileSpeechOutput: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String) {
        speak(text, voice: preferredVoice())
    }

    func preview(_ text: String, voiceNamed name: String) -> Bool {
        let candidates = AVSpeechSynthesisVoice.speechVoices().filter {
            $0.name.localizedCaseInsensitiveContains(name)
        }
        guard let voice = candidates.max(by: {
            $0.quality.rawValue < $1.quality.rawValue
        }) else { return false }
        speak(text, voice: voice)
        return true
    }

    private func speak(_ text: String, voice: AVSpeechSynthesisVoice?) {
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.pitchMultiplier = 1.0
        utterance.preUtteranceDelay = 0.08
        synthesizer.speak(utterance)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    func inventoryDescription() -> String {
        let voices = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("en") }
            .sorted {
                if $0.language != $1.language { return $0.language < $1.language }
                if $0.quality.rawValue != $1.quality.rawValue {
                    return $0.quality.rawValue > $1.quality.rawValue
                }
                return $0.name < $1.name
            }
        let selectedIdentifier = preferredVoice()?.identifier
        let lines = voices.map { voice in
            let selected = voice.identifier == selectedIdentifier ? "SELECTED · " : ""
            return "\(selected)\(voice.name) · \(voice.language) · \(qualityName(voice.quality)) · \(genderName(voice.gender)) · \(voice.identifier)"
        }
        return (["English voices installed: \(voices.count)"] + lines).joined(separator: "\n")
    }

    private func preferredVoice() -> AVSpeechSynthesisVoice? {
        let language = Locale.current.language.languageCode?.identifier ?? "en"
        let voices = AVSpeechSynthesisVoice.speechVoices().filter {
            $0.language.hasPrefix(language)
        }
        let selectedIdentifier = "com.apple.ttsbundle.siri_Nicky_en-US_premium"
        if let selected = voices.first(where: { $0.identifier == selectedIdentifier }) {
            return selected
        }
        let preferredNames = ["Nicky", "Ava", "Samantha", "Zoe", "Susan"]
        for name in preferredNames {
            if let voice = voices
                .filter({ $0.name.localizedCaseInsensitiveContains(name) })
                .max(by: { $0.quality.rawValue < $1.quality.rawValue }) {
                return voice
            }
        }
        return voices.max { $0.quality.rawValue < $1.quality.rawValue }
            ?? AVSpeechSynthesisVoice(language: "en-US")
    }

    private func qualityName(_ quality: AVSpeechSynthesisVoiceQuality) -> String {
        switch quality {
        case .premium: "premium"
        case .enhanced: "enhanced"
        default: "default"
        }
    }

    private func genderName(_ gender: AVSpeechSynthesisVoiceGender) -> String {
        switch gender {
        case .female: "female"
        case .male: "male"
        default: "unspecified"
        }
    }
}
