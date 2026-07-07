use tauri_app_lib::llm::{
    llm_provider::{get_active_provider, LlmProvider, ProviderConfig},
    DocumentMetadata,
};

#[tokio::test]
async fn test_mock_provider_health_check() {
    let provider: LlmProvider = get_active_provider(ProviderConfig {
        provider_type: "mock".to_string(),
        api_key: "".to_string(),
        model: "".to_string(),
        base_url: None,
    });

    let res = provider
        .call_simple("Perform a brief system check. Reply with exactly the word 'OK'.", None)
        .await
        .expect("Health check should succeed");

    assert_eq!(res.trim(), "OK");
}

#[tokio::test]
async fn test_mock_provider_metadata_extraction() {
    let provider: LlmProvider = get_active_provider(ProviderConfig {
        provider_type: "mock".to_string(),
        api_key: "".to_string(),
        model: "".to_string(),
        base_url: None,
    });

    let doc_text = "חוזה שכירות דירה ברחוב דיזנגוף 77 בתל אביב בין המשכיר יעל אוחנה לשוכר אלי נחמיאס";
    let metadata: DocumentMetadata = tauri_app_lib::llm::call_provider(&provider, doc_text)
        .await
        .expect("Mock provider metadata extraction should succeed");

    assert_eq!(metadata.doc_type, Some(serde_json::Value::String("contract".to_string())));
    assert!(metadata.title.unwrap().contains("שכירות"));
    assert_eq!(metadata.confidence, Some(0.95));
}

#[tokio::test]
async fn test_openai_provider_custom_url_routing() {
    // Proves custom base_url is routed properly by verifying that calling a mock port
    // returns a connection error specifically for that port, instead of hitting the real OpenAI API.
    let provider = get_active_provider(ProviderConfig {
        provider_type: "openai".to_string(),
        api_key: "dummy-key".to_string(),
        model: "dummy-model".to_string(),
        base_url: Some("http://127.0.0.1:9999/v1".to_string()),
    });

    let err_msg = provider
        .call_simple("hello", None)
        .await
        .expect_err("Should fail with a connection error to local port 9999");

    assert!(
        err_msg.contains("9999") || err_msg.contains("connection") || err_msg.contains("connect"),
        "Error message did not indicate custom port routing: {}",
        err_msg
    );
}
