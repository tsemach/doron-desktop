use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::auth;

// ASC-142 -- "Users and Roles" Settings tab. Token-in-body calls to the
// backend's org/desktop/* routes (apps/backend/app/api/v1/org/desktop/**),
// same convention as auth::login_with_credentials/verify_session (the
// desktop webview can't hold a browser cookie across restarts).
//
// Unlike login_with_credentials (which establishes the session itself and
// needs its own typed response shape), these four commands are homogeneous
// authenticated CRUD-ish calls against an already-established session, so
// they share one small helper instead of repeating the reqwest+status+
// error-unwrap dance four times.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OrgMember {
    pub id: String,
    pub name: Option<String>,
    pub email: String,
    pub role: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

const GENERIC_ERROR: &str = "Something went wrong. Please try again.";

/// POSTs `body` (with `token` merged in) to `{backend_url}{path}`, returning
/// the parsed JSON body on 2xx or the server's `error` message otherwise.
async fn call_org_desktop(app: &AppHandle, path: &str, mut body: Value) -> Result<Value, String> {
    let backend_url = auth::get_backend_url(app).ok_or("Sign in to manage your organization.")?;
    let token = auth::get_session_token(app).ok_or("Sign in to manage your organization.")?;

    if let Value::Object(map) = &mut body {
        map.insert("token".to_string(), Value::String(token));
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{backend_url}{path}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach the server: {e}"))?;

    let status = response.status();
    let json: Value = response.json().await.map_err(|_| GENERIC_ERROR.to_string())?;

    if !status.is_success() {
        let error = json.get("error").and_then(|v| v.as_str()).unwrap_or("Request failed").to_string();
        return Err(error);
    }

    Ok(json)
}

#[tauri::command]
pub async fn list_org_members(app: AppHandle) -> Result<Vec<OrgMember>, String> {
    let json = call_org_desktop(&app, "/api/v1/org/desktop/members", json!({})).await?;
    serde_json::from_value(json.get("members").cloned().unwrap_or(Value::Array(vec![]))).map_err(|_| GENERIC_ERROR.to_string())
}

#[tauri::command]
pub async fn invite_org_member(app: AppHandle, email: String, role: String, team_id: Option<String>) -> Result<(), String> {
    call_org_desktop(
        &app,
        "/api/v1/org/desktop/invitations",
        json!({ "email": email, "role": role, "teamId": team_id }),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn change_org_member_role(app: AppHandle, user_id: String, role: String) -> Result<(), String> {
    call_org_desktop(&app, "/api/v1/org/desktop/users/role", json!({ "userId": user_id, "role": role })).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_org_member(app: AppHandle, user_id: String) -> Result<(), String> {
    call_org_desktop(&app, "/api/v1/org/desktop/users/delete", json!({ "userId": user_id })).await?;
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TeamMemberEntry {
    pub id: String,
    pub name: Option<String>,
    pub email: String,
    pub role: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TeamEntry {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    #[serde(rename = "managerId")]
    pub manager_id: String,
    #[serde(rename = "managerName")]
    pub manager_name: Option<String>,
    #[serde(rename = "managerEmail")]
    pub manager_email: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub members: Vec<TeamMemberEntry>,
}

#[tauri::command]
pub async fn list_teams(app: AppHandle) -> Result<Vec<TeamEntry>, String> {
    let json = call_org_desktop(&app, "/api/v1/org/desktop/teams", json!({})).await?;
    serde_json::from_value(json.get("teams").cloned().unwrap_or(Value::Array(vec![]))).map_err(|_| GENERIC_ERROR.to_string())
}

#[tauri::command]
pub async fn create_team(app: AppHandle, name: String, manager_id: Option<String>, color: Option<String>) -> Result<(), String> {
    call_org_desktop(
        &app,
        "/api/v1/org/desktop/teams/create",
        json!({ "name": name, "managerId": manager_id, "color": color }),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn update_team(
    app: AppHandle,
    team_id: String,
    name: Option<String>,
    manager_id: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    call_org_desktop(
        &app,
        "/api/v1/org/desktop/teams/update",
        json!({ "teamId": team_id, "name": name, "managerId": manager_id, "color": color }),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_team(app: AppHandle, team_id: String) -> Result<(), String> {
    call_org_desktop(&app, "/api/v1/org/desktop/teams/delete", json!({ "teamId": team_id })).await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_team_member(app: AppHandle, team_id: String, user_id: String) -> Result<(), String> {
    call_org_desktop(
        &app,
        "/api/v1/org/desktop/teams/members/remove",
        json!({ "teamId": team_id, "userId": user_id }),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn add_team_member(app: AppHandle, team_id: String, user_id: String) -> Result<(), String> {
    call_org_desktop(
        &app,
        "/api/v1/org/desktop/teams/members/add",
        json!({ "teamId": team_id, "userId": user_id }),
    )
    .await?;
    Ok(())
}
