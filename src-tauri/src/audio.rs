use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{WavSpec, WavWriter};
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use cpal::SampleFormat;

pub struct StreamWrapper(pub cpal::Stream);
unsafe impl Send for StreamWrapper {}
unsafe impl Sync for StreamWrapper {}

pub struct AudioState {
    pub stream: Option<StreamWrapper>,
    pub wav_data: Arc<Mutex<Option<Vec<i16>>>>,
    pub spec: Option<WavSpec>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            stream: None,
            wav_data: Arc::new(Mutex::new(None)),
            spec: None,
        }
    }
}

#[tauri::command]
pub fn start_recording(state: tauri::State<'_, Mutex<AudioState>>) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("Failed to get default input device")?;
    let config = device.default_input_config().map_err(|e| e.to_string())?;
    
    let sample_rate = config.sample_rate().0;
    let channels = config.channels();
    
    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    
    let wav_data = Arc::new(Mutex::new(Some(Vec::new())));
    let wav_data_clone = wav_data.clone();
    
    let err_fn = |err| eprintln!("an error occurred on stream: {}", err);
    
    let stream = match config.sample_format() {
        SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &_| {
                if let Ok(mut lock) = wav_data_clone.lock() {
                    if let Some(vec) = lock.as_mut() {
                        for &sample in data {
                            vec.push((sample * i16::MAX as f32) as i16);
                        }
                    }
                }
            },
            err_fn,
            None,
        ).map_err(|e| e.to_string())?,
        SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _: &_| {
                if let Ok(mut lock) = wav_data_clone.lock() {
                    if let Some(vec) = lock.as_mut() {
                        vec.extend_from_slice(data);
                    }
                }
            },
            err_fn,
            None,
        ).map_err(|e| e.to_string())?,
        _ => return Err("Unsupported sample format".to_string()),
    };
    
    stream.play().map_err(|e| e.to_string())?;
    
    let mut state_lock = state.lock().unwrap();
    state_lock.stream = Some(StreamWrapper(stream));
    state_lock.wav_data = wav_data;
    state_lock.spec = Some(spec);
    
    Ok(())
}

#[tauri::command]
pub fn stop_recording(state: tauri::State<'_, Mutex<AudioState>>) -> Result<String, String> {
    let mut state_lock = state.lock().unwrap();
    
    if let Some(stream_wrapper) = state_lock.stream.take() {
        drop(stream_wrapper.0); // Stop recording
    } else {
        return Err("No active recording".to_string());
    }
    
    let wav_data = state_lock.wav_data.lock().unwrap().take().unwrap_or_default();
    let spec = state_lock.spec.take().unwrap();
    
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = WavWriter::new(&mut cursor, spec).map_err(|e| e.to_string())?;
        for sample in wav_data {
            writer.write_sample(sample).map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }
    
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    Ok(STANDARD.encode(cursor.into_inner()))
}
