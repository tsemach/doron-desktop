use tauri_app_lib::embeddings::get_cache_dir;

#[test]
fn test_get_cache_dir() {
    let cache_dir = get_cache_dir();
    println!("cache_dir: {:?}", cache_dir);
}