use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use sha2::{Sha256, Digest};
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

// Replicate the downloader core logic to test it in isolation
async fn test_download_core(
    url: &str,
    temp_path: &Path,
    dest_path: &Path,
    simulate_fail_at: Option<u64>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("TestAgent")
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    let mut current_size = std::fs::metadata(temp_path).map(|m| m.len()).unwrap_or(0);
    let mut req = client.get(url);
    if current_size > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={}-", current_size));
    }

    let mut response = req.send().await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        let _ = std::fs::remove_file(temp_path);
        current_size = 0;
        response = client.get(url).send().await
            .map_err(|e| format!("Failed to connect: {}", e))?;
    }

    if !response.status().is_success() {
        return Err(format!("Error status: {}", response.status()));
    }

    let expected_sha256 = {
        let mut sha = None;
        if let Some(etag_header) = response.headers().get("etag") {
            let etag_str = etag_header.to_str().unwrap_or("").trim_matches('"');
            if etag_str.len() == 64 && etag_str.chars().all(|c| c.is_ascii_hexdigit()) {
                sha = Some(etag_str.to_string());
            }
        }
        if sha.is_none() {
            if let Some(x_etag) = response.headers().get("x-linked-etag") {
                let etag_str = x_etag.to_str().unwrap_or("").trim_matches('"');
                if etag_str.len() == 64 && etag_str.chars().all(|c| c.is_ascii_hexdigit()) {
                    sha = Some(etag_str.to_string());
                }
            }
        }
        sha
    };

    let total_size = if response.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        let parsed_total = if let Some(content_range) = response.headers().get(reqwest::header::CONTENT_RANGE) {
            let range_str = content_range.to_str().unwrap_or("");
            if let Some(slash_idx) = range_str.rfind('/') {
                range_str[slash_idx + 1..].parse::<u64>().ok()
            } else {
                None
            }
        } else {
            None
        };
        parsed_total.or_else(|| {
            response.content_length().map(|len| len + current_size)
        })
    } else {
        current_size = 0;
        response.content_length()
    };

    let _total_size = total_size.ok_or_else(|| "Failed to get total size".to_string())?;

    let mut file = if current_size > 0 {
        std::fs::OpenOptions::new()
            .write(true)
            .append(true)
            .open(temp_path)
            .map_err(|e| format!("Failed to open for append: {}", e))?
    } else {
        std::fs::File::create(temp_path)
            .map_err(|e| format!("Failed to create temp file: {}", e))?
    };

    let mut downloaded = current_size;
    let mut response = response;

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if let Some(fail_threshold) = simulate_fail_at {
            if downloaded + chunk.len() as u64 >= fail_threshold {
                // Write partial chunk up to threshold to simulate connection drop mid-write
                let writable_len = (fail_threshold - downloaded) as usize;
                if writable_len > 0 {
                    use std::io::Write;
                    file.write_all(&chunk[..writable_len]).map_err(|e| e.to_string())?;
                }
                return Err("Simulated download failure".to_string());
            }
        }

        use std::io::Write;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
    }

    std::fs::rename(temp_path, dest_path)
        .map_err(|e| format!("Failed to rename: {}", e))?;

    if let Some(ref expected_hex) = expected_sha256 {
        let is_valid = verify_file_sha256(dest_path, expected_hex)?;
        if !is_valid {
            let _ = std::fs::remove_file(dest_path);
            return Err("Checksum validation failed".to_string());
        }
    }

    Ok(())
}

fn verify_file_sha256(path: &Path, expected_hex: &str) -> Result<bool, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let result = hasher.finalize();
    let hex_result = format!("{:x}", result);
    Ok(hex_result == expected_hex)
}

// Spawns a fully async mock HTTP server that serves a test buffer and supports Range headers.
async fn run_mock_server(data: Vec<u8>, sha256_hex: String) -> (String, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let addr = format!("http://127.0.0.1:{}", port);
    
    let shared_data = Arc::new(data);
    let shared_sha = Arc::new(sha256_hex);

    let handle = tokio::spawn(async move {
        loop {
            let (mut stream, _) = match listener.accept().await {
                Ok(s) => s,
                Err(_) => break,
            };
            
            let shared_data = shared_data.clone();
            let shared_sha = shared_sha.clone();
            
            tokio::spawn(async move {
                let mut buf = [0; 2048];
                let n = match stream.read(&mut buf).await {
                    Ok(n) if n > 0 => n,
                    _ => return,
                };
                let req_str = String::from_utf8_lossy(&buf[..n]);
                
                // Parse Range header
                let mut range_start = None;
                for line in req_str.lines() {
                    if line.to_lowercase().starts_with("range:") {
                        if let Some(bytes_part) = line.split('=').nth(1) {
                            if let Some(start_str) = bytes_part.split('-').next() {
                                if let Ok(start) = start_str.trim().parse::<u64>() {
                                    range_start = Some(start);
                                }
                            }
                        }
                    }
                }

                let response_bytes = if let Some(start) = range_start {
                    let start_idx = start as usize;
                    if start_idx >= shared_data.len() {
                        let resp = "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Length: 0\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes()).await;
                        return;
                    }
                    
                    let body = &shared_data[start_idx..];
                    let content_range = format!("bytes {}-{}/{}", start, shared_data.len() - 1, shared_data.len());
                    let headers = format!(
                        "HTTP/1.1 206 Partial Content\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nContent-Range: {}\r\nETag: \"{}\"\r\n\r\n",
                        body.len(),
                        content_range,
                        shared_sha
                    );
                    
                    let mut resp = headers.into_bytes();
                    resp.extend_from_slice(body);
                    resp
                } else {
                    let headers = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nETag: \"{}\"\r\n\r\n",
                        shared_data.len(),
                        shared_sha
                    );
                    let mut resp = headers.into_bytes();
                    resp.extend_from_slice(&shared_data);
                    resp
                };

                let _ = stream.write_all(&response_bytes).await;
                let _ = stream.flush().await;
            });
        }
    });

    (addr, handle)
}

#[tokio::test]
async fn test_fresh_download_success() {
    let test_data = vec![0x41; 100 * 1024]; // 100KB of 'A'
    let mut hasher = Sha256::new();
    hasher.update(&test_data);
    let expected_sha256 = format!("{:x}", hasher.finalize());

    let (server_url, server_handle) = run_mock_server(test_data.clone(), expected_sha256.clone()).await;
    
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join("test_file.download");
    let dest_file = temp_dir.join("test_file.gguf");
    
    let _ = fs::remove_file(&temp_file);
    let _ = fs::remove_file(&dest_file);

    let res = test_download_core(&server_url, &temp_file, &dest_file, None).await;
    assert!(res.is_ok(), "Download failed: {:?}", res);
    assert!(dest_file.exists());
    
    let downloaded_data = fs::read(&dest_file).unwrap();
    assert_eq!(downloaded_data, test_data);

    let _ = fs::remove_file(&temp_file);
    let _ = fs::remove_file(&dest_file);
    server_handle.abort();
}

#[tokio::test]
async fn test_resumable_download_success() {
    let test_data = (0..100 * 1024).map(|i| (i % 256) as u8).collect::<Vec<u8>>(); // 100KB patterned bytes
    let mut hasher = Sha256::new();
    hasher.update(&test_data);
    let expected_sha256 = format!("{:x}", hasher.finalize());

    let (server_url, server_handle) = run_mock_server(test_data.clone(), expected_sha256.clone()).await;
    
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join("test_resume.download");
    let dest_file = temp_dir.join("test_resume.gguf");
    
    let _ = fs::remove_file(&temp_file);
    let _ = fs::remove_file(&dest_file);

    // 1. Start download but simulate failure at 40KB
    let res = test_download_core(&server_url, &temp_file, &dest_file, Some(40 * 1024)).await;
    assert!(res.is_err());
    assert!(temp_file.exists());
    assert_eq!(fs::metadata(&temp_file).unwrap().len(), 40 * 1024);
    assert!(!dest_file.exists());

    // 2. Resume download (simulate_fail_at is None)
    let res = test_download_core(&server_url, &temp_file, &dest_file, None).await;
    assert!(res.is_ok(), "Resume failed: {:?}", res);
    assert!(dest_file.exists());
    assert!(!temp_file.exists());

    let downloaded_data = fs::read(&dest_file).unwrap();
    assert_eq!(downloaded_data, test_data);

    let _ = fs::remove_file(&temp_file);
    let _ = fs::remove_file(&dest_file);
    server_handle.abort();
}

#[tokio::test]
async fn test_range_error_fallback() {
    let test_data = vec![0x42; 50 * 1024]; // 50KB of 'B'
    let mut hasher = Sha256::new();
    hasher.update(&test_data);
    let expected_sha256 = format!("{:x}", hasher.finalize());

    let (server_url, server_handle) = run_mock_server(test_data.clone(), expected_sha256.clone()).await;
    
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join("test_fallback.download");
    let dest_file = temp_dir.join("test_fallback.gguf");
    
    let _ = fs::remove_file(&temp_file);
    let _ = fs::remove_file(&dest_file);

    // Write invalid/too-large mock temp file to trigger RANGE_NOT_SATISFIABLE (size 60KB > server size 50KB)
    fs::write(&temp_file, vec![0; 60 * 1024]).unwrap();

    let res = test_download_core(&server_url, &temp_file, &dest_file, None).await;
    assert!(res.is_ok(), "Fallback failed: {:?}", res);
    assert!(dest_file.exists());

    let downloaded_data = fs::read(&dest_file).unwrap();
    assert_eq!(downloaded_data, test_data);

    let _ = fs::remove_file(&temp_file);
    let _ = fs::remove_file(&dest_file);
    server_handle.abort();
}

#[tokio::test]
async fn test_checksum_mismatch_failure() {
    let test_data = vec![0x43; 20 * 1024]; // 20KB of 'C'
    let incorrect_sha256 = "0000000000000000000000000000000000000000000000000000000000000000".to_string();

    let (server_url, server_handle) = run_mock_server(test_data.clone(), incorrect_sha256).await;
    
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join("test_checksum.download");
    let dest_file = temp_dir.join("test_checksum.gguf");
    
    let _ = fs::remove_file(&temp_file);
    let _ = fs::remove_file(&dest_file);

    let res = test_download_core(&server_url, &temp_file, &dest_file, None).await;
    assert!(res.is_err());
    assert_eq!(res.unwrap_err(), "Checksum validation failed");
    assert!(!dest_file.exists());

    let _ = fs::remove_file(&temp_file);
    server_handle.abort();
}
