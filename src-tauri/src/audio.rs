use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};
use hound::{WavSpec, WavWriter};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

/// cpal streams are `!Send` on some hosts. The stream is only ever touched
/// while holding `AudioState::stream`'s mutex, so moving it between threads
/// inside that mutex is sound.
pub struct StreamWrapper(#[allow(dead_code)] pub cpal::Stream);
unsafe impl Send for StreamWrapper {}

/// Whisper is fed 16 kHz mono regardless of what the capture device produces —
/// the API downsamples server-side even if we don't. Doing it here shrinks the
/// upload and every in-process copy of the audio by 6x for a typical 48 kHz
/// stereo microphone.
const WHISPER_SAMPLE_RATE: u32 = 16_000;

/// 16 kHz mono 16-bit is 32 KB/s; Groq rejects uploads over 25 MB (~13 min).
/// Stop buffering well before that so a stuck key can't eat memory.
const MAX_RECORDING_SECONDS: usize = 10 * 60;

/// Anything shorter than this after trimming silence is a tap, not speech.
const MIN_SPEECH_SAMPLES: usize = WHISPER_SAMPLE_RATE as usize / 4; // 250 ms

/// Recording state. Every field is independently synchronised so the 30 Hz
/// level poll never waits behind a device open, and the real-time audio
/// callback only ever takes the short-lived `wav_data` lock.
pub struct AudioState {
    stream: Mutex<Option<StreamWrapper>>,
    spec: Mutex<Option<WavSpec>>,
    wav_data: Arc<Mutex<Vec<i16>>>,
    /// Latest RMS level as `f32` bits.
    rms_level: Arc<AtomicU32>,
    is_recording: Arc<AtomicBool>,
    /// Set by the cpal error callback (device unplugged, sleep/resume, …).
    stream_failed: Arc<AtomicBool>,
    /// Whether media was playing when dictation started and we paused it.
    did_mute: Mutex<bool>,
    /// The frontend turns capture off while there is no API key, so a press
    /// doesn't open the mic or pause media for nothing.
    capture_enabled: AtomicBool,
    /// "Instant start": keep the stream open between takes. Opening a
    /// WASAPI capture stream costs 0.4-1 s on some laptops, but Windows shows
    /// the mic-in-use icon for as long as one exists, so this is opt-in.
    keep_warm: AtomicBool,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            stream: Mutex::new(None),
            spec: Mutex::new(None),
            wav_data: Arc::new(Mutex::new(Vec::new())),
            rms_level: Arc::new(AtomicU32::new(0)),
            is_recording: Arc::new(AtomicBool::new(false)),
            stream_failed: Arc::new(AtomicBool::new(false)),
            did_mute: Mutex::new(false),
            capture_enabled: AtomicBool::new(true),
            keep_warm: AtomicBool::new(false),
        }
    }
}

/// Poisoning only means another thread panicked mid-update; the data here is
/// still usable, and refusing it would kill dictation until restart.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn to_whisper_pcm(samples: &[i16], sample_rate: u32, channels: u16) -> Vec<i16> {
    let channels = channels.max(1) as usize;
    let frame_count = samples.len() / channels;
    if frame_count == 0 {
        return Vec::new();
    }

    // Fold the channels together first.
    let mut mono: Vec<i16> = Vec::with_capacity(frame_count);
    for frame in 0..frame_count {
        let base = frame * channels;
        let sum: i32 = (0..channels).map(|c| samples[base + c] as i32).sum();
        // The mean of i16 inputs always fits back into an i16.
        mono.push((sum / channels as i32) as i16);
    }

    if sample_rate == WHISPER_SAMPLE_RATE {
        return mono;
    }

    // Average over each decimation window. Box filtering is not a steep
    // low-pass, but it removes the aliasing that plain sample-dropping would
    // fold back into the speech band.
    let step = sample_rate as f64 / WHISPER_SAMPLE_RATE as f64;
    let half_window = (step / 2.0).floor() as usize;
    let out_frames = (frame_count as f64 / step) as usize;
    let mut out = Vec::with_capacity(out_frames);

    for index in 0..out_frames {
        let center = ((index as f64 * step) as usize).min(frame_count - 1);
        let start = center.saturating_sub(half_window);
        let end = (center + half_window + 1).min(frame_count);
        let window = &mono[start..end];
        let sum: i32 = window.iter().map(|&s| s as i32).sum();
        out.push((sum / window.len() as i32) as i16);
    }

    out
}

/// Cut leading/trailing silence from 16 kHz mono PCM. Whisper is prone to
/// hallucinating ("Thank you.", "Thanks for watching!") on silence, and every
/// silent second is upload time. Returns an empty slice when nothing in the
/// clip rises above the noise floor.
fn trim_silence(pcm: &[i16]) -> &[i16] {
    const FRAME: usize = 320; // 20 ms
    const PAD: usize = 4_000; // keep 250 ms either side so word edges survive

    if pcm.len() < FRAME {
        return &[];
    }

    let frame_rms: Vec<f64> = pcm
        .chunks(FRAME)
        .map(|frame| {
            let sum_sq: f64 = frame.iter().map(|&s| (s as f64) * (s as f64)).sum();
            (sum_sq / frame.len() as f64).sqrt()
        })
        .collect();

    // Gate relative to this clip's own noise floor (quiet mics vary a lot),
    // capped well under its loudest frame so continuous speech with no pauses
    // is never trimmed away, and never below roughly -50 dBFS.
    let mut sorted = frame_rms.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let noise_floor = sorted[sorted.len() / 10];
    let peak = sorted[sorted.len() - 1];
    let gate = (noise_floor * 2.5)
        .min(peak * 0.25)
        .max(0.003 * i16::MAX as f64);

    let first = frame_rms.iter().position(|&rms| rms > gate);
    let last = frame_rms.iter().rposition(|&rms| rms > gate);
    match (first, last) {
        (Some(first), Some(last)) => {
            let start = (first * FRAME).saturating_sub(PAD);
            let end = ((last + 1) * FRAME + PAD).min(pcm.len());
            &pcm[start..end]
        }
        _ => &[],
    }
}

fn encode_wav(pcm: &[i16]) -> Result<Vec<u8>, String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: WHISPER_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::with_capacity(44 + pcm.len() * 2));
    {
        let mut writer = WavWriter::new(&mut cursor, spec).map_err(|e| e.to_string())?;
        let mut samples = writer.get_i16_writer(pcm.len() as u32);
        for &sample in pcm {
            samples.write_sample(sample);
        }
        samples.flush().map_err(|e| e.to_string())?;
        writer.finalize().map_err(|e| e.to_string())?;
    }
    Ok(cursor.into_inner())
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    state: &AudioState,
    max_samples: usize,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    i16: FromSample<T>,
    f32: FromSample<T>,
{
    let wav_data = state.wav_data.clone();
    let rms_level = state.rms_level.clone();
    let is_recording = state.is_recording.clone();
    let stream_failed = state.stream_failed.clone();

    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                if !is_recording.load(Ordering::Relaxed) || data.is_empty() {
                    return;
                }

                let mut sum_sq = 0.0f32;
                if let Ok(mut buffer) = wav_data.lock() {
                    let room = max_samples.saturating_sub(buffer.len());
                    buffer.extend(data.iter().take(room).map(|&s| s.to_sample::<i16>()));
                }
                for &sample in data {
                    let value = sample.to_sample::<f32>();
                    sum_sq += value * value;
                }
                let rms = (sum_sq / data.len() as f32).sqrt();
                rms_level.store(rms.to_bits(), Ordering::Relaxed);
            },
            move |err| {
                eprintln!("[audio] Stream error: {}", err);
                stream_failed.store(true, Ordering::SeqCst);
            },
            None,
        )
        .map_err(|e| e.to_string())
}

/// Open the default input device and start a stream that writes into
/// `wav_data` whenever `is_recording` is set.
fn open_stream(state: &AudioState) -> Result<StreamWrapper, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No microphone found")?;

    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let max_samples = sample_rate as usize * channels as usize * MAX_RECORDING_SECONDS;

    *lock(&state.spec) = Some(WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    });

    let stream = match format {
        SampleFormat::F32 => build_stream::<f32>(&device, &config, state, max_samples)?,
        SampleFormat::I16 => build_stream::<i16>(&device, &config, state, max_samples)?,
        SampleFormat::U16 => build_stream::<u16>(&device, &config, state, max_samples)?,
        SampleFormat::I32 => build_stream::<i32>(&device, &config, state, max_samples)?,
        SampleFormat::F64 => build_stream::<f64>(&device, &config, state, max_samples)?,
        SampleFormat::U8 => build_stream::<u8>(&device, &config, state, max_samples)?,
        other => return Err(format!("Unsupported microphone sample format: {other}")),
    };

    state.stream_failed.store(false, Ordering::SeqCst);
    stream.play().map_err(|e| e.to_string())?;
    Ok(StreamWrapper(stream))
}

/// Make sure a live stream sits in `slot`, reusing a warm one when it is
/// still healthy. Building one is the slow part of starting a take.
fn ensure_stream(state: &AudioState, slot: &mut Option<StreamWrapper>) -> Result<(), String> {
    if slot.is_some() && !state.stream_failed.load(Ordering::SeqCst) {
        return Ok(());
    }
    // A failed stream (device unplugged, sleep/resume) is rebuilt.
    slot.take();
    *slot = Some(open_stream(state)?);
    Ok(())
}

pub fn capture_enabled(state: &AudioState) -> bool {
    state.capture_enabled.load(Ordering::SeqCst)
}

/// Start a recording. Returns `Ok(false)` if one is already running.
///
/// Without "Instant start" the stream is built for every recording and
/// dropped afterwards: Windows shows the microphone "in use" indicator for as
/// long as a capture stream exists, even a paused one.
pub fn start_recording_internal(state: &AudioState) -> Result<bool, String> {
    // Held for the whole start, so a release that lands while the device is
    // still opening waits here and then stops this take instead of racing it.
    let mut slot = lock(&state.stream);
    if state.is_recording.load(Ordering::SeqCst) {
        return Ok(false);
    }
    state.rms_level.store(0, Ordering::Relaxed);
    {
        let mut buffer = lock(&state.wav_data);
        buffer.clear();
        // About 30 s up front so the audio thread rarely reallocates.
        if let Some(spec) = *lock(&state.spec) {
            buffer.reserve(spec.sample_rate as usize * spec.channels as usize * 30);
        }
    }
    ensure_stream(state, &mut slot)?;
    state.is_recording.store(true, Ordering::SeqCst);
    Ok(true)
}

/// Turn "Instant start" on or off. Opens or closes the standing stream off
/// the caller's thread, since opening can take most of a second.
#[tauri::command]
pub fn set_keep_mic_ready(app: tauri::AppHandle, enabled: bool) {
    use tauri::Manager;
    app.state::<AudioState>().keep_warm.store(enabled, Ordering::SeqCst);
    std::thread::spawn(move || {
        let state = app.state::<AudioState>();
        let mut slot = lock(&state.stream);
        if state.is_recording.load(Ordering::SeqCst) {
            return; // the take's own stop applies the new setting
        }
        if !state.keep_warm.load(Ordering::SeqCst) {
            slot.take();
        } else if let Err(err) = ensure_stream(&state, &mut slot) {
            eprintln!("[audio] Could not keep the microphone ready: {err}");
        }
    });
}

/// Pause media if it is playing. Must run after `start_recording_internal`.
pub fn mute_for_dictation(state: &AudioState) {
    let paused = mute_system_internal();
    let mut did_mute = lock(&state.did_mute);
    if !paused {
        return;
    }
    if state.is_recording.load(Ordering::SeqCst) {
        *did_mute = true;
    } else {
        // The key was released while we were pausing; undo it right away.
        drop(did_mute);
        unmute_system_internal();
    }
}

fn restore_media(state: &AudioState) {
    let should_unmute = std::mem::replace(&mut *lock(&state.did_mute), false);
    if should_unmute {
        // The WinRT call blocks for tens of ms; keep it off the caller's path.
        std::thread::spawn(unmute_system_internal);
    }
}

/// Stop the active recording and return its samples plus format, or `None`
/// when nothing was recording (so stale audio can never be returned).
fn finish_recording(state: &AudioState) -> Option<(Vec<i16>, WavSpec)> {
    // Lock before flipping the flag: a start still opening the device holds
    // this lock, so the release waits for it rather than missing it.
    let mut slot = lock(&state.stream);
    let was_recording = state.is_recording.swap(false, Ordering::SeqCst);
    // Dropping the stream closes the capture endpoint and clears the mic
    // indicator. With "Instant start" it stays open for the next take.
    if !state.keep_warm.load(Ordering::SeqCst) || state.stream_failed.load(Ordering::SeqCst) {
        slot.take();
    }
    drop(slot);
    state.rms_level.store(0, Ordering::Relaxed);
    restore_media(state);

    if !was_recording {
        return None;
    }
    let samples = std::mem::take(&mut *lock(&state.wav_data));
    let spec = (*lock(&state.spec))?;
    Some((samples, spec))
}

/// Stop and throw the audio away (shortcut cancelled, no API key, …).
pub fn cancel_recording_internal(state: &AudioState) {
    let _ = finish_recording(state);
    // Release the buffer's memory; recordings can be several MB.
    *lock(&state.wav_data) = Vec::new();
}

/// Stop recording and return a 16 kHz mono WAV of the speech, or an empty
/// body when there was no speech worth sending.
#[tauri::command]
pub async fn stop_recording(
    state: tauri::State<'_, AudioState>,
) -> Result<tauri::ipc::Response, String> {
    let failed = state.stream_failed.load(Ordering::SeqCst);
    let Some((samples, spec)) = finish_recording(&state) else {
        return Ok(tauri::ipc::Response::new(Vec::new()));
    };
    if failed && samples.is_empty() {
        return Err("Microphone stopped responding".into());
    }

    // Resampling and encoding a long take is real work; keep it off the
    // async runtime's reactor threads.
    let wav = tauri::async_runtime::spawn_blocking(move || {
        let pcm = to_whisper_pcm(&samples, spec.sample_rate, spec.channels);
        drop(samples);
        let speech = trim_silence(&pcm);
        if speech.len() < MIN_SPEECH_SAMPLES {
            return Ok(Vec::new());
        }
        encode_wav(speech)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(tauri::ipc::Response::new(wav))
}

#[tauri::command]
pub fn cancel_recording(state: tauri::State<'_, AudioState>) {
    cancel_recording_internal(&state);
}

#[tauri::command]
pub fn get_audio_level(state: tauri::State<'_, AudioState>) -> f32 {
    f32::from_bits(state.rms_level.load(Ordering::Relaxed))
}

#[tauri::command]
pub fn set_capture_enabled(state: tauri::State<'_, AudioState>, enabled: bool) {
    state.capture_enabled.store(enabled, Ordering::SeqCst);
}

/// Pause the current media session if it is playing. Returns whether it did.
fn mute_system_internal() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        };

        let result = (|| -> Result<bool, windows::core::Error> {
            let manager =
                GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;
            let session = manager.GetCurrentSession()?;
            let status = session.GetPlaybackInfo()?.PlaybackStatus()?;
            if status != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                return Ok(false);
            }
            // Only report a pause that actually happened, or the later
            // "resume" would toggle media the user never had playing.
            session.TryPauseAsync()?.get()
        })();

        match result {
            Ok(paused) => paused,
            Err(err) => {
                eprintln!("[audio] Media pause skipped: {err}");
                false
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    false
}

fn unmute_system_internal() {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        };
        let result = (|| -> Result<(), windows::core::Error> {
            let manager =
                GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;
            let session = manager.GetCurrentSession()?;
            // Explicit play (not toggle): if the user already resumed or
            // switched apps meanwhile, we must not pause their audio.
            let status = session.GetPlaybackInfo()?.PlaybackStatus()?;
            if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused {
                session.TryPlayAsync()?.get()?;
            }
            Ok(())
        })();
        if let Err(err) = result {
            eprintln!("[audio] Media resume skipped: {err}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_stereo_and_halves_the_frame_rate() {
        // One second of 48 kHz stereo at a constant level.
        let samples = vec![1000i16; 48_000 * 2];
        let out = to_whisper_pcm(&samples, 48_000, 2);

        assert_eq!(out.len(), 16_000, "one second should stay one second");
        assert!(out.iter().all(|&s| s == 1000), "constant level must survive");
    }

    #[test]
    fn leaves_16khz_mono_untouched() {
        let samples = vec![-500i16, 0, 500];
        assert_eq!(to_whisper_pcm(&samples, 16_000, 1), samples);
    }

    #[test]
    fn handles_empty_and_sub_frame_input() {
        assert!(to_whisper_pcm(&[], 48_000, 2).is_empty());
        assert!(to_whisper_pcm(&[7i16], 48_000, 2).is_empty());
    }

    #[test]
    fn silence_trims_to_nothing() {
        let silence = vec![3i16; 16_000];
        assert!(trim_silence(&silence).is_empty());
    }

    #[test]
    fn trims_quiet_edges_around_speech() {
        // 1 s quiet, 0.5 s loud, 1 s quiet.
        let mut pcm = vec![10i16; 16_000];
        pcm.extend(std::iter::repeat(8_000i16).take(8_000));
        pcm.extend(std::iter::repeat(10i16).take(16_000));
        let speech = trim_silence(&pcm);
        assert!(speech.len() >= 8_000, "speech must survive");
        assert!(speech.len() <= 8_000 + 2 * 4_000 + 640, "edges must be trimmed");
    }

    #[test]
    fn encodes_a_valid_wav_header() {
        let wav = encode_wav(&[0i16; 100]).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(wav.len(), 44 + 200);
    }
}
