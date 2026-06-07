use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use once_cell::sync::OnceCell;
use std::sync::mpsc;
use tauri::AppHandle;

const CLIENT_ID: &str = "1512915399514128554";

pub enum RichPresenceCmd {
    Set {
        details: String,
        state: Option<String>,
        project_name: Option<String>,
        small_image_key: Option<String>,
    },
    Clear,
}

pub static RP_SENDER: OnceCell<mpsc::Sender<RichPresenceCmd>> = OnceCell::new();

pub fn init(_app: AppHandle) {
    let (tx, rx) = mpsc::channel::<RichPresenceCmd>();
    // Store the sender globally so commands can reach it
    let _ = RP_SENDER.set(tx);

    std::thread::spawn(move || {
        let mut client = match DiscordIpcClient::new(CLIENT_ID) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[rich_presence] Failed to create client: {e}");
                return;
            }
        };

        if let Err(e) = client.connect() {
            eprintln!("[rich_presence] Failed to connect to Discord: {e}");
            return;
        }

        let opened_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let _ = client.set_activity(
            activity::Activity::new()
                .details("Browsing Projects...")
                .assets(
                    activity::Assets::new()
                        .large_image("celestia-logo-tiny_1_")
                        .large_text("Celestia IDE"),
                )
                .timestamps(activity::Timestamps::new().start(opened_time)),
        );

        for cmd in rx {
            match cmd {
                RichPresenceCmd::Set { details, state, project_name, small_image_key } => {
                    let large_text = if let Some(ref proj) = project_name {
                        format!("Celestia IDE - {proj}")
                    } else {
                        "Celestia IDE".to_string()
                    };

                    let mut assets = activity::Assets::new()
                        .large_image("celestia-logo-tiny_1_")
                        .large_text(&large_text);

                    if let Some(ref key) = small_image_key {
                        assets = assets
                            .small_image(key)
                            .small_text(project_name.as_deref().unwrap_or("Project"));
                    }

                    let mut act = activity::Activity::new()
                        .details(&details)
                        .assets(assets)
                        .timestamps(activity::Timestamps::new().start(opened_time));

                    if let Some(ref s) = state {
                        act = act.state(s);
                    }

                    let _ = client.set_activity(act);
                }
                RichPresenceCmd::Clear => {
                    let _ = client.clear_activity();
                }
            }
        }
    });
}
