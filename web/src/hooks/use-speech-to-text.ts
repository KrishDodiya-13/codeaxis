'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * Voice dictation through the browser's Web Speech API. No packages, no backend:
 * Chrome, Edge and Safari support it; Firefox does not, so `supported` is false there
 * and callers should hide the control. Note that Chrome sends the audio to Google's
 * speech service to transcribe it.
 *
 * The API is not in TypeScript's DOM lib yet, hence the minimal types below.
 */

interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  isFinal: boolean
  0: RecognitionAlternative
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const ERRORS: Record<string, string> = {
  'not-allowed': "Microphone access is blocked. Allow it in your browser's site settings.",
  'service-not-allowed': "Microphone access is blocked. Allow it in your browser's site settings.",
  'audio-capture': 'No microphone was found.',
  'no-speech': "Didn't hear anything. Try again a little closer to the mic.",
  network: 'Voice input needs an internet connection in this browser.',
}

/**
 * @param onFinal called with each finished phrase, ready to append to a text field.
 */
export function useSpeechToText(onFinal: (text: string) => void) {
  // Decided after mount so server and client render the same markup.
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)

  useEffect(() => {
    onFinalRef.current = onFinal
  })

  useEffect(() => {
    setSupported(recognitionConstructor() !== null)
    return () => recognition.current?.abort()
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionConstructor()
    if (!Ctor || recognition.current) return
    setError(null)
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'

    rec.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result) continue
        const text = result[0].transcript
        if (result.isFinal) {
          if (text.trim()) onFinalRef.current(text.trim())
        } else {
          pending += text
        }
      }
      setInterim(pending)
    }
    rec.onerror = (event) => {
      // 'aborted' is us stopping it on purpose; nothing to report.
      if (event.error !== 'aborted') setError(ERRORS[event.error] ?? 'Voice input stopped unexpectedly.')
    }
    rec.onend = () => {
      recognition.current = null
      setListening(false)
      setInterim('')
    }

    recognition.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      recognition.current = null
      setError('Could not start the microphone.')
    }
  }, [])

  const stop = useCallback(() => {
    recognition.current?.stop()
  }, [])

  return { supported, listening, interim, error, start, stop }
}
