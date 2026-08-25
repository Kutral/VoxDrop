use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use hound::{WavSpec, WavWriter};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[allow(dead_code)]
pub struct StreamWrapper(pub cpal::Stream);
unsafe impl Send for StreamWrapper {}
unsafe impl Sync for StreamWrapper {}

pub struct AudioState {
    pub stream: Option<StreamWrapper>,
    pub wav_data: Arc<Mutex<Vec<i16>>>,
    pub spec: Option<WavSpec>,
    pub rms_level: Arc<Mutex<f32>>,
    pub is_recording: Arc<AtomicBool>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            stream: None,
            wav_data: Arc::new(Mutex::new(Vec::new())),
            spec: None,
            rms_level: Arc::new(Mutex::new(0.0)),
            is_recording: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn compute_rms(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f64 = samples
        .iter()
        .map(|&s| {
            let normalized = s as f64 / i16::MAX as f64;
            normalized * normalized
        })
        .sum();
    (sum_sq / samples.len() as f64).sqrt() as f32
}

pub fn setup_audio(state: &Mutex<AudioState>) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("Failed to get default input device")?;

    let device_name = device.name().unwrap_or_else(|_| "unknown".into());
    eprintln!("[audio] Pre-warming input device: {}", device_name);

    let config = device.default_input_config().map_err(|e| e.to_string())?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels();

    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut state_lock = state.lock().unwrap();
    if state_lock.stream.is_some() {
        return Ok(());
    }

    state_lock.spec = Some(spec);
    let wav_data = state_lock.wav_data.clone();
    let rms_level = state_lock.rms_level.clone();
    let is_recording = state_lock.is_recording.clone();

    let err_fn = |err| eprintln!("[audio] Stream error: {}", err);

    let stream = match config.sample_format() {
        SampleFormat::F32 => device
            .build_input_stream(
                &config.into(),
                move |data: &[f32], _: &_| {
                    if !is_recording.load(Ordering::SeqCst) {
                        if let Ok(mut level) = rms_level.lock() {
                            *level = 0.0;
                        }
                        return;
                    }

                    if let Ok(mut lock) = wav_data.lock() {
                        for &sample in data {
                            lock.push((sample * i16::MAX as f32) as i16);
                        }
                    }
                    if !data.is_empty() {
                        let sum_sq: f32 = data.iter().map(|&s| s * s).sum();
                        let rms = (sum_sq / data.len() as f32).sqrt();
                        if let Ok(mut level) = rms_level.lock() {
                            *level = rms;
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())?,
        SampleFormat::I16 => device
            .build_input_stream(
                &config.into(),
                move |data: &[i16], _: &_| {
                    if !is_recording.load(Ordering::SeqCst) {
                        if let Ok(mut level) = rms_level.lock() {
                            *level = 0.0;
                        }
                        return;
                    }

                    if let Ok(mut lock) = wav_data.lock() {
                        lock.extend_from_slice(data);
                    }
                    if !data.is_empty() {
                        let rms = compute_rms(data);
                        if let Ok(mut level) = rms_level.lock() {
                            *level = rms;
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())?,
        SampleFormat::U16 => device
            .build_input_stream(
                &config.into(),
                move |data: &[u16], _: &_| {
                    if !is_recording.load(Ordering::SeqCst) {
                        if let Ok(mut level) = rms_level.lock() {
                            *level = 0.0;
                        }
                        return;
                    }

                    let converted: Vec<i16> = data
                        .iter()
                        .map(|&sample| (sample as i32 - 32768) as i16)
                        .collect();

                    if let Ok(mut lock) = wav_data.lock() {
                        lock.extend_from_slice(&converted);
                    }
                    if !converted.is_empty() {
                        let rms = compute_rms(&converted);
                        if let Ok(mut level) = rms_level.lock() {
                            *level = rms;
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| e.to_string())?,
        _ => return Err("Unsupported sample format".to_string()),
    };

    stream.play().map_err(|e| e.to_string())?;
    state_lock.stream = Some(StreamWrapper(stream));
    eprintln!("[audio] Stream created (paused, will start on demand)");
    drop(state_lock);

    let state_lock = state.lock().unwrap();
    if let Some(ref stream) = state_lock.stream {
        stream.0.pause().map_err(|e| e.to_string())?;
    }
    eprintln!("[audio] Stream paused until recording starts");

    Ok(())
}

#[tauri::command]
pub fn start_recording(state: tauri::State<'_, Mutex<AudioState>>) -> Result<(), String> {
    start_recording_internal(&state).map(|_| ())
}

pub fn start_recording_internal(state: &Mutex<AudioState>) -> Result<bool, String> {
    {
        let state_lock = state.lock().unwrap();
        if state_lock.is_recording.load(Ordering::SeqCst) {
            eprintln!("[audio] Recording start ignored; already recording");
            return Ok(false);
        }

        if state_lock.stream.is_none() {
            drop(state_lock);
            setup_audio(state)?;
        }
    }

    // Health-check the parked stream: after sleep/resume or an audio device
    // change the old stream can be permanently dead, which made the hotkey
    // appear broken until the app was restarted. Probe it, rebuild once if
    // dead, and re-park it paused either way (mic stays released while idle).
    let stream_dead = {
        let mut state_lock = state.lock().unwrap();
        match state_lock.stream.as_ref() {
            Some(stream) => {
                let alive = stream.0.play().is_ok() && stream.0.pause().is_ok();
                if !alive {
                    state_lock.stream = None;
                }
                !alive
            }
            None => false,
        }
    };
    if stream_dead {
        eprintln!("[audio] Existing stream failed health check; rebuilding");
        setup_audio(state)?;
    }

    let state_lock = state.lock().unwrap();

    if state_lock.is_recording.swap(true, Ordering::SeqCst) {
        eprintln!("[audio] Recording start ignored; already recording");
        return Ok(false);
    }

    if let Some(ref stream) = state_lock.stream {
        if let Err(err) = stream.0.play() {
            state_lock.is_recording.store(false, Ordering::SeqCst);
            return Err(err.to_string());
        }
        eprintln!("[audio] Stream resumed for recording");
    } else {
        state_lock.is_recording.store(false, Ordering::SeqCst);
        return Err("Audio stream is not available".to_string());
    }

    if let Ok(mut data) = state_lock.wav_data.lock() {
        data.clear();
    }
    eprintln!("[audio] Recording started (flag set)");
    Ok(true)
}

#[tauri::command]
pub fn stop_recording(state: tauri::State<'_, Mutex<AudioState>>) -> Result<String, String> {
    let (wav_data, spec) = {
        let mut state_lock = state.lock().unwrap();
        state_lock.is_recording.store(false, Ordering::SeqCst);

        if let Some(stream) = state_lock.stream.take() {
            let _ = stream.0.pause();
            eprintln!("[audio] Stream paused and dropped after recording");
        }

        let data = state_lock.wav_data.lock().unwrap().clone();
        let spec = state_lock.spec.ok_or("No audio spec found")?;
        (data, spec)
    };

    if let Ok(mut level) = state.lock().unwrap().rms_level.lock() {
        *level = 0.0;
    }

    eprintln!("[audio] Recording stopped, {} samples", wav_data.len());

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = WavWriter::new(&mut cursor, spec).map_err(|e| e.to_string())?;
        for sample in wav_data {
            writer.write_sample(sample).map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(STANDARD.encode(cursor.into_inner()))
}

#[tauri::command]
pub fn get_audio_level(state: tauri::State<'_, Mutex<AudioState>>) -> Result<f32, String> {
    let state_lock = state.lock().unwrap();
    let level = state_lock.rms_level.lock().map_err(|e| e.to_string())?;
    Ok(*level)
}

#[tauri::command]
pub fn mute_system() -> Result<bool, String> {
    mute_system_internal()
}

pub fn mute_system_internal() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        };

        let mut was_playing = false;

        let _ = (|| -> Result<(), windows::core::Error> {
            let manager =
                GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;

            if let Ok(session) = manager.GetCurrentSession() {
                if let Ok(info) = session.GetPlaybackInfo() {
                    if let Ok(status) = info.PlaybackStatus() {
                        if status
                            == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                        {
                            was_playing = true;
                            let _ = session.TryTogglePlayPauseAsync()?.get();
                        }
                    }
                }
            }
            Ok(())
        })();

        return Ok(was_playing);
    }

    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

#[tauri::command]
pub fn unmute_system(did_mute: bool) -> Result<(), String> {
    if !did_mute {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        let _ = (|| -> Result<(), windows::core::Error> {
            let manager =
                GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;
            if let Ok(session) = manager.GetCurrentSession() {
                session.TryTogglePlayPauseAsync()?.get()?;
            }
            Ok(())
        })();
    }

    Ok(())
}
