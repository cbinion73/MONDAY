import AVFoundation
import Foundation
import Speech

@MainActor
final class MobileSpeechCapture {
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var inputTapInstalled = false

    func start(
        onText: @escaping @MainActor (String) -> Void,
        onFinal: @escaping @MainActor (String) -> Void,
        onStop: @escaping @MainActor () -> Void,
        onError: @escaping @MainActor (String) -> Void
    ) async {
        do {
            await stop()
            guard await microphonePermission() else {
                throw SpeechCaptureError.microphonePermission
            }
            guard await speechPermission() else {
                throw SpeechCaptureError.speechPermission
            }
            try beginRecognition(onText: onText, onFinal: onFinal, onStop: onStop, onError: onError)
        } catch {
            await stop()
            onError(error.localizedDescription)
        }
    }

    func stop(submit: Bool = false) async {
        if audioEngine.isRunning { audioEngine.stop() }
        if inputTapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            inputTapInstalled = false
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func beginRecognition(
        onText: @escaping @MainActor (String) -> Void,
        onFinal: @escaping @MainActor (String) -> Void,
        onStop: @escaping @MainActor () -> Void,
        onError: @escaping @MainActor (String) -> Void
    ) throws {
        guard let recognizer = SFSpeechRecognizer(locale: Locale.current), recognizer.isAvailable else {
            throw SpeechCaptureError.recognizerUnavailable
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        inputTapInstalled = true

        recognitionTask = recognizer.recognitionTask(with: request) { result, error in
            Task { @MainActor in
                if let result {
                    onText(result.bestTranscription.formattedString)
                    if result.isFinal {
                        let finalText = result.bestTranscription.formattedString
                        await self.stop()
                        onStop()
                        onFinal(finalText)
                    }
                }
                if let error {
                    await self.stop()
                    onError(error.localizedDescription)
                }
            }
        }
        audioEngine.prepare()
        try audioEngine.start()
    }

    private nonisolated func speechPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    private nonisolated func microphonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}

private enum SpeechCaptureError: LocalizedError {
    case speechPermission
    case microphonePermission
    case recognizerUnavailable

    var errorDescription: String? {
        switch self {
        case .speechPermission:
            "Speech recognition permission was not granted. Enable MONDAY in Settings → Privacy & Security → Speech Recognition."
        case .microphonePermission:
            "Microphone permission was not granted. Enable MONDAY in Settings → Privacy & Security → Microphone."
        case .recognizerUnavailable:
            "Apple Speech recognition is temporarily unavailable."
        }
    }
}
