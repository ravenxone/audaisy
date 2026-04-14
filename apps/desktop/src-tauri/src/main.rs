#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::blocking::Client;
use serde::Deserialize;
use std::{
    error::Error,
    io,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread::sleep,
    time::{Duration, Instant},
};
use tauri::{Manager, RunEvent, WebviewWindowBuilder};

const EXPECTED_CONTRACT_VERSION: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../packages/contracts/version.txt"));
const REPO_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../..");
const RUNTIME_PYTHON_RELATIVE_PATH: &str = "apps/runtime/.venv/bin/python";
const CONTRACT_ARTIFACTS_RELATIVE_PATH: &str = "packages/contracts";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(15);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(250);

struct RuntimeProcessState(Mutex<Option<Child>>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    healthy: bool,
    contract_version: String,
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let app_data_root = app.path().app_data_dir().map_err(|error| boxed_error(format!(
                "Unable to resolve the Audaisy app data directory: {error}"
            )))?;

            let (startup_error, runtime_base_url, child) = launch_runtime(&app_data_root);
            app.manage(RuntimeProcessState(Mutex::new(child)));

            let mut initialization_script = String::new();
            if let Some(base_url) = runtime_base_url {
                initialization_script.push_str(&format!(
                    "window.__AUDAISY_RUNTIME_BASE_URL__ = {};",
                    serde_json::to_string(&base_url)?
                ));
            }
            if let Some(message) = startup_error {
                initialization_script.push_str(&format!(
                    "window.__AUDAISY_RUNTIME_STARTUP_ERROR__ = {};",
                    serde_json::to_string(&message)?
                ));
            }

            let window_config = app
                .config()
                .app
                .windows
                .first()
                .ok_or_else(|| boxed_error("No window configuration found for the main desktop window."))?;

            WebviewWindowBuilder::from_config(app.handle(), window_config)?
                .initialization_script(initialization_script)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Audaisy desktop shell");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            shutdown_runtime(app_handle);
        }
    });
}

fn launch_runtime(app_data_root: &Path) -> (Option<String>, Option<String>, Option<Child>) {
    let repo_root = Path::new(REPO_ROOT);
    let python_path = repo_root.join(RUNTIME_PYTHON_RELATIVE_PATH);
    if !python_path.exists() {
        return (
            Some(format!(
                "Runtime launch failed because {} was not found.",
                python_path.display()
            )),
            None,
            None,
        );
    }

    let port = match choose_open_port() {
        Ok(port) => port,
        Err(message) => return (Some(message), None, None),
    };
    let base_url = format!("http://127.0.0.1:{port}");
    let contract_artifacts_dir = repo_root.join(CONTRACT_ARTIFACTS_RELATIVE_PATH);

    let mut child = match spawn_runtime_process(&python_path, app_data_root, &contract_artifacts_dir, port) {
        Ok(child) => child,
        Err(message) => return (Some(message), None, None),
    };

    match wait_for_health(&mut child, &base_url) {
        Ok(health) if health.healthy => {
            if health.contract_version != EXPECTED_CONTRACT_VERSION.trim() {
                kill_child(&mut child);
                return (
                    Some(format!(
                        "Runtime contract mismatch: desktop expects {}, runtime reported {}.",
                        EXPECTED_CONTRACT_VERSION.trim(),
                        health.contract_version
                    )),
                    None,
                    None,
                );
            }
            (None, Some(base_url), Some(child))
        }
        Ok(_) => {
            kill_child(&mut child);
            (
                Some("The local runtime did not report a healthy status.".to_string()),
                None,
                None,
            )
        }
        Err(message) => {
            kill_child(&mut child);
            (Some(message), None, None)
        }
    }
}

fn spawn_runtime_process(
    python_path: &Path,
    app_data_root: &Path,
    contract_artifacts_dir: &PathBuf,
    port: u16,
) -> Result<Child, String> {
    Command::new(python_path)
        .arg("-m")
        .arg("audaisy_runtime")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--app-data-root")
        .arg(app_data_root)
        .arg("--contract-artifacts-dir")
        .arg(contract_artifacts_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("Unable to launch the local runtime: {error}"))
}

fn wait_for_health(child: &mut Child, base_url: &str) -> Result<HealthResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(1))
        .build()
        .map_err(|error| format!("Unable to create the runtime health client: {error}"))?;
    let deadline = Instant::now() + HEALTH_TIMEOUT;

    while Instant::now() < deadline {
        if let Some(exit_status) = child
            .try_wait()
            .map_err(|error| format!("Unable to inspect runtime process status: {error}"))?
        {
            return Err(format!(
                "Runtime exited before becoming healthy with status {exit_status}."
            ));
        }

        match client.get(format!("{base_url}/healthz")).send() {
            Ok(response) if response.status().is_success() => {
                return response
                    .json::<HealthResponse>()
                    .map_err(|error| format!("Unable to parse the runtime health response: {error}"));
            }
            Ok(_) | Err(_) => sleep(HEALTH_POLL_INTERVAL),
        }
    }

    Err("Runtime health check timed out before /healthz became available.".to_string())
}

fn choose_open_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Unable to allocate a localhost port for the runtime: {error}"))?
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Unable to resolve the localhost runtime port: {error}"))
}

fn shutdown_runtime<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    let state = app_handle.state::<RuntimeProcessState>();
    let mut guard = state.0.lock().expect("runtime process mutex poisoned");
    if let Some(mut child) = guard.take() {
        kill_child(&mut child);
    }
}

fn kill_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn boxed_error(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(io::Error::other(message.into()))
}
