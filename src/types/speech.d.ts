/**
 * Web Speech API TypeScript Ambient Declarations
 * Provides type definitions for the Web Speech Recognition API
 */

/**
 * Event fired when speech recognition produces results
 */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

/**
 * Array-like collection of speech recognition results
 */
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

/**
 * A single result from speech recognition containing one or more alternatives
 */
interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

/**
 * An alternative transcription with confidence score
 */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Event fired when speech recognition encounters an error
 */
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

/**
 * Main Speech Recognition interface
 */
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

/**
 * Extend the global Window interface with Speech Recognition API
 */
declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
  }
}

export {};
