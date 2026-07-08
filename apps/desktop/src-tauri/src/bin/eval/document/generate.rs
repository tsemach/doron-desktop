use clap::Args;
use std::fs;
use std::path::Path;
use tauri_app_lib::llm::llm_provider::{get_active_provider, ProviderConfig};

#[derive(Args, Debug, Clone)]
pub struct GenerateArgs {
    /// Directory to write the synthetic corpus to
    #[arg(long, default_value = "./evaluation_corpus")]
    pub corpus_dir: String,

    /// Use a real online LLM to generate rich synthetic texts instead of static templates
    #[arg(long)]
    pub ai: bool,

    /// LLM provider type (e.g., claude, gemini, openai, mock)
    #[arg(long, default_value = "mock")]
    pub provider: String,

    /// LLM model name
    #[arg(long)]
    pub model: Option<String>,

    /// API key for the LLM provider
    #[arg(long)]
    pub api_key: Option<String>,
}

pub async fn execute(args: GenerateArgs) -> Result<(), String> {
    let _guard = tauri_app_lib::power::SleepPreventionGuard::new(true);
    let out_dir = Path::new(&args.corpus_dir);
    fs::create_dir_all(out_dir).map_err(|e| format!("Failed to create corpus dir: {e}"))?;

    println!("Generating corpus in {}...", out_dir.display());

    let documents: Vec<(String, String, String)> = get_corpus_templates()
        .into_iter()
        .map(|(filename, doc_type, desc)| {
            let docx_filename = filename.replace(".txt", ".docx");
            (docx_filename, doc_type, desc)
        })
        .collect();

    if args.ai {
        let api_key = args.api_key.unwrap_or_default();
        let model = args
            .model
            .unwrap_or_else(|| "claude-sonnet-4-6".to_string());

        let mut _sidecar_guard = crate::sidecar::SidecarGuard { child: None };

        if args.provider.to_lowercase() == "local" {
            let client = reqwest::Client::new();
            let health_url = "http://localhost:10086/health";
            
            // Check if already online first
            let already_online = client.get(health_url).send().await
                .map(|r| r.status().is_success())
                .unwrap_or(false);

            if already_online {
                println!("Local model server is already online and ready.");
            } else {
                println!("Local model server is offline. Spawning sidecar automatically... ");

                // Kill any zombie/hanging local server process first
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = std::process::Command::new("pkill")
                        .arg("-f")
                        .arg("llama-server")
                        .status();
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
                #[cfg(target_os = "windows")]
                {
                    let _ = std::process::Command::new("taskkill")
                        .args(&["/F", "/IM", "llama-server.exe"])
                        .status();
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }

                let sidecar_path = crate::sidecar::get_cli_sidecar_path()?;
                let model_file = tauri_app_lib::llm::get_model_filename(&model)?;
                let model_path = tauri_app_lib::store::cli_app_data_dir().join("models").join(model_file);

                if !model_path.exists() {
                    return Err(format!(
                        "Local model not found at {:?}. Please download it via the desktop application settings first.",
                        model_path
                    ));
                }

                let port = 10086;
                let mut cmd = std::process::Command::new(&sidecar_path);
                cmd.arg("--model")
                    .arg(&model_path)
                    .arg("--port")
                    .arg(port.to_string())
                    .arg("--threads")
                    .arg("4")
                    .arg("-c")
                    .arg("8192")
                    .arg("--host")
                    .arg("127.0.0.1");

                let template = if model.to_lowercase().contains("qwen") {
                    "chatml"
                } else if model.to_lowercase().contains("gemma") {
                    "gemma"
                } else if model.to_lowercase().contains("phi-4") {
                    "phi4"
                } else {
                    "chatml"
                };
                cmd.arg("--chat-template").arg(template);

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }

                let app_data_dir = tauri_app_lib::store::cli_app_data_dir();
                let log_file_path = app_data_dir.join("llama_sidecar.log");
                let log_file = std::fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .open(&log_file_path)
                    .map_err(|e| format!("Failed to create log file {:?}: {}", log_file_path, e))?;

                cmd.stdout(log_file.try_clone().map_err(|e| e.to_string())?);
                cmd.stderr(log_file);

                let child = cmd.spawn()
                    .map_err(|e| format!("Failed to spawn local sidecar: {}", e))?;
                _sidecar_guard.child = Some(child);

                println!("Waiting for local model server to finish loading and warm up (up to 120s)...");
                let mut online = false;
                for _ in 0..240 {
                    if client.get(health_url).send().await.map(|r| r.status().is_success()).unwrap_or(false) {
                        online = true;
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
                if !online {
                    return Err("Local model server did not become responsive (warmup timeout). Please verify it is running.".to_string());
                }
                println!("Local model server is online and ready.");
            }
        }

        let provider = get_active_provider(ProviderConfig {
            provider_type: args.provider.clone(),
            api_key,
            model,
            base_url: None,
        });

        for (filename, doc_type, desc) in &documents {
            let file_path = out_dir.join(filename);
            println!("Generating (AI) {}...", filename);

            let template_str = match get_few_shot_template(doc_type) {
                Some(tpl) => format!(
                    "\n\nFollow the structure, terminology, and legal style of this Hebrew template example where applicable:\n---\n{}\n---",
                    tpl
                ),
                None => String::new(),
            };

            let prompt = format!(
                "Draft a realistic, detailed Hebrew legal document or correspondence of type '{}'. Description: {}. Write only the document text in Hebrew, without any markdown formatting or meta commentaries.{}",
                doc_type, desc, template_str
            );

            let text = provider.call_simple(&prompt, Some("You are a helpful assistant that writes realistic dummy legal documents in Hebrew.")).await?;
            write_docx_file(&file_path, &text)?;
        }
    } else {
        for (filename, _, desc) in &documents {
            let file_path = out_dir.join(filename);
            let text = get_static_document_text(filename, desc);
            write_docx_file(&file_path, &text)?;
        }
    }

    // Generate evaluation dataset json containing 3 queries per document
    let mut dataset = Vec::new();
    for (filename, doc_type, desc) in &documents {
        let queries = generate_queries(filename, doc_type, desc);
        for q in queries {
            dataset.push(serde_json::json!({
                "query": q,
                "expected_files": vec![filename.clone()]
            }));
        }
    }
    let dataset_path = out_dir.join("evaluation_dataset.json");
    let dataset_json = serde_json::to_string_pretty(&dataset)
        .map_err(|e| format!("Failed to serialize dataset JSON: {e}"))?;
    fs::write(&dataset_path, dataset_json)
        .map_err(|e| format!("Failed to write evaluation_dataset.json: {e}"))?;

    println!(
        "\x1b[32mSuccess!\x1b[0m Generated {} files in {}",
        documents.len(),
        out_dir.display()
    );
    Ok(())
}

fn generate_queries(filename: &str, doc_type: &str, desc: &str) -> Vec<String> {
    let hebrew_type = match doc_type {
        "contract" => "חוזה",
        "report" => "דוח",
        "will" => "צוואה",
        "letter" => "מכתב",
        "invoice" => "חשבונית",
        "memo" => "תזכיר",
        _ => "מסמך",
    };

    let parts: Vec<&str> = desc
        .split(|c| c == '.' || c == ',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    let q1 = if !parts.is_empty() {
        parts[0].to_string()
    } else {
        format!("חיפוש {} {}", hebrew_type, filename.replace(".docx", "").replace(".txt", "").replace('_', " "))
    };

    let q2 = if parts.len() > 1 {
        let clean_part = parts[1].replace(':', " ");
        format!("{} {}", hebrew_type, clean_part)
    } else {
        format!("{} קובץ {}", hebrew_type, filename.replace(".docx", "").replace(".txt", "").replace('_', " "))
    };

    let q3 = if parts.len() > 2 {
        let clean_part = parts[2].replace(':', " ");
        format!("{} {}", hebrew_type, clean_part)
    } else if !parts.is_empty() {
        let words: Vec<&str> = parts[0].split_whitespace().collect();
        if words.len() > 2 {
            format!("{} {}", hebrew_type, words[words.len() - 2..].join(" "))
        } else {
            format!("{} חיפוש", hebrew_type)
        }
    } else {
        format!("{} מסמך", hebrew_type)
    };

    vec![q1, q2, q3]
}

fn get_corpus_templates() -> Vec<(String, String, String)> {
    vec![
        // Target 1
        (
            "chozeh_mecher_dira_levy.txt".to_string(),
            "contract".to_string(),
            "חוזה מכר דירה למכירת דירה בתל אביב. מוכרת: רחל לוי. קונה: יוסף ישראלי. הדירה ברחוב רוטשילד".to_string(),
        ),
        // Target 2
        (
            "heskem_gerushin_abraham.txt".to_string(),
            "contract".to_string(),
            "הסכם גירושין ופירוד משותף שנערך בירושלים בין משה אברהם לבין מרים אברהם. משמורת ילדים משותפת".to_string(),
        ),
        // Target 3
        (
            "tviah_rashlanut_refuit.txt".to_string(),
            "report".to_string(),
            "כתב תביעה בגין רשלנות רפואית שהוגש נגד בית החולים הדסה עין כרם בירושלים בעניין טיפול רפואי רשלני".to_string(),
        ),
        // Target 4
        (
            "hospital_report.txt".to_string(),
            "report".to_string(),
            "דוח רפואי רשמי מבית החולים הדסה עין כרם המפרט טיפול רפואי, ניתוח, ואבחנה לאחר סיבוך רפואי".to_string(),
        ),
        // Target 5
        (
            "chozeh_schirut_nehmias.txt".to_string(),
            "contract".to_string(),
            "חוזה שכירות דירה ברחוב דיזנגוף 77 בתל אביב. שוכר: אלי נחמיאס. משכיר: יעל אוחנה".to_string(),
        ),
        // Target 6
        (
            "tzavaah_cohen.txt".to_string(),
            "will".to_string(),
            "צוואה אחרונה בהחלט של המנוח יצחק כהן המוריש את כל רכושו ודירתו לבניו ולבנותיו".to_string(),
        ),
        // Distractor 1
        (
            "letter_to_municipality.txt".to_string(),
            "letter".to_string(),
            "מכתב תלונה לעיריית חיפה על דוח חניה לא מוצדק ברחוב הרצל".to_string(),
        ),
        // Distractor 2
        (
            "invoice_office_supplies.txt".to_string(),
            "invoice".to_string(),
            "חשבונית רכישה של ציוד משרדי מחברת אופיס דיפו כולל דפים, עטים וקלסרים".to_string(),
        ),
        // Distractor 3
        (
            "recipe_shakshuka.txt".to_string(),
            "other".to_string(),
            "מתכון להכנת שקשוקה ישראלית פיקנטית עם עגבניות, ביצים, שום ופלפל חריף".to_string(),
        ),
        // Distractor 4
        (
            "court_schedule_haifa.txt".to_string(),
            "other".to_string(),
            "לוח דיונים כללי של בית משפט השלום בחיפה לתאריך 15 ביולי 2024".to_string(),
        ),
        // Distractor 5
        (
            "memo_security_procedures.txt".to_string(),
            "memo".to_string(),
            "תזכיר נהלי אבטחה וכניסה למשרדי החברה עבור עובדים וקבלני משנה חיצוניים".to_string(),
        ),
        // Distractor 6
        (
            "lease_generic_commercial.txt".to_string(),
            "contract".to_string(),
            "טיוטת חוזה שכירות מסחרית להשכרת משרד באזור התעשייה הרצליה פיתוח".to_string(),
        ),
        // Distractor 7
        (
            "meeting_minutes_board.txt".to_string(),
            "memo".to_string(),
            "פרוטוקול ישיבת דירקטוריון של חברת ההייטק טק-סטארט בעניין סבב גיוס הון".to_string(),
        ),
        // Distractor 8
        (
            "employment_contract_developer.txt".to_string(),
            "contract".to_string(),
            "חוזה העסקה סטנדרטי למשרת מפתח תוכנה כולל נספח סודיות ואי תחרות".to_string(),
        ),
        // Distractor 9
        (
            "power_of_attorney_general.txt".to_string(),
            "other".to_string(),
            "ייפוי כוח כללי בלתי חוזר להעברת זכויות וניהול נכסים פיננסיים".to_string(),
        ),
        // Distractor 10
        (
            "partnership_agreement_draft.txt".to_string(),
            "contract".to_string(),
            "הסכם שותפות עסקית להקמת מיזם משותף בין שני יזמים פרטיים".to_string(),
        ),
        // Distractor 11
        (
            "loan_agreement_family.txt".to_string(),
            "contract".to_string(),
            "הסכם הלוואה ללא ריבית בין בני משפחה לצורך סיוע ברכישת דירה".to_string(),
        ),
        // Distractor 12
        (
            "insurance_policy_car.txt".to_string(),
            "other".to_string(),
            "תעודת ביטוח מקיף לרכב פרטי הכוללת כיסויים נגד גניבה, תאונה ונזקי צד ג".to_string(),
        ),
        // Distractor 13
        (
            "software_license_mit.txt".to_string(),
            "other".to_string(),
            "רישיון תוכנה חופשית מסוג MIT המאפשר שימוש מסחרי חופשי בקוד מקור".to_string(),
        ),
        // Distractor 14
        (
            "tax_report_2023.txt".to_string(),
            "report".to_string(),
            "דוח מס שנתי לשנת המס 2023 המוגש לרשות המיסים בישראל".to_string(),
        ),
        // Distractor 15
        (
            "client_feedback_form.txt".to_string(),
            "other".to_string(),
            "משוב לקוחות מרכז השירות ותגובות מנהל תמיכה טכנית".to_string(),
        ),
        // Distractor 16
        (
            "travel_itinerary_italy.txt".to_string(),
            "other".to_string(),
            "מסלול טיול מפורט למשך שבוע בצפון איטליה הכולל מלונות, מסעדות ואטרקציות".to_string(),
        ),
        // Distractor 17
        (
            "warrant_search_template.txt".to_string(),
            "other".to_string(),
            "נוסח צו חיפוש משטרתי חתום על ידי שופט בית משפט השלום".to_string(),
        ),
        // Distractor 18
        (
            "letter_tenant_repair.txt".to_string(),
            "letter".to_string(),
            "פנייה בכתב משוכר למשכיר בדרישה לתיקון נזילת מים דחופה מהתקרה בדירה".to_string(),
        ),
        // Distractor 19
        (
            "contract_marketing_services.txt".to_string(),
            "contract".to_string(),
            "חוזה התקשרות למתן שירותי שיווק דיגיטלי וניהול רשתות חברתיות".to_string(),
        ),
        // Distractor 20
        (
            "nondisclosure_agreement_standard.txt".to_string(),
            "contract".to_string(),
            "הסכם שמירת סודיות הדדי לחשיפת מידע טכנולוגי ועסקי רגיש".to_string(),
        ),
        // Distractor 21
        (
            "purchase_order_laptops.txt".to_string(),
            "invoice".to_string(),
            "הזמנת רכש רשמית עבור 10 מחשבים ניידים עבור צוות פיתוח תוכנה".to_string(),
        ),
        // Distractor 22
        (
            "minutes_parking_committee.txt".to_string(),
            "memo".to_string(),
            "סיכום ישיבת ועד שכונת נווה שאנן בעניין הסדרי חניה חדשים".to_string(),
        ),
        // Distractor 23
        (
            "will_anonymous_template.txt".to_string(),
            "will".to_string(),
            "נוסח כללי וריק להכנת צוואה אישית בעדים לפי חוק הירושה".to_string(),
        ),
        // Distractor 24
        (
            "court_ruling_traffic.txt".to_string(),
            "report".to_string(),
            "פסק דין בעניין עבירת מהירות מופרזת ופסילת רישיון נהיגה בפועל".to_string(),
        ),
    ]
}

fn get_static_document_text(filename: &str, desc: &str) -> String {
    let clean_title = filename.replace(".docx", "").replace(".txt", "").replace('_', " ");

    if filename.contains("chozeh")
        || filename.contains("heskem")
        || filename.contains("contract")
        || filename.contains("lease")
        || filename.contains("nondisclosure")
        || filename.contains("agreement")
        || filename.contains("employment")
    {
        // Contract/Agreement template
        format!(
            r#"הסכם והתקשרות משפטית מחייבת
=====================================
שנערך ונחתם ביום 26 ביוני 2024.

בין:
צד א' (להלן: "הספק" או "המתקשר הראשון")
לבין:
צד ב' (להלן: "הלקוח" או "המתקשר השני")

מבוא והואיל:
1. הואיל והצדדים מעוניינים להסדיר את מערכת היחסים המשפטית והעסקית ביניהם בהתאם למוסכם בהסכם זה;
2. והואיל ותמצית מטרת ההסכם וההבנות הינה: {desc};
3. והואיל והצדדים מצהירים כי הסכם זה משקף נאמנה את רצונם החופשי והמלא, ואין כל מניעה חוקית או חוזית להתקשרותם;

לפיכך הוצהר, הותנה והוסכם בין הצדדים כדלקמן:

פרק א: הגדרות ופרשנות
המבוא להסכם זה והנספחים המצורפים אליו מהווים חלק בלתי נפרד הימנו ומחייבים כיתר תנאיו. כותרות הסעיפים נועדו לנוחות בלבד ולא ישמשו לפרשנות ההסכם.

פרק ב: התחייבויות הצדדים והצהרות
1. כל צד מתחייב לפעול בתום לב, בהגינות ובמקצועיות מירבית לצורך הגשמת מטרות החוזה.
2. תחומי הפעילות ונושא ההתקשרות העיקרי: {clean_title}.
3. הצדדים מתחייבים לשתף פעולה באופן מלא ולספק זה לזה את כל המידע והמסמכים הדרושים לצורך ביצוע ההסכם.

פרק ג: שמירת סודיות ואי תחרות
כל מידע שיעבור בין הצדדים במהלך תקופת ההסכם ייחשב כמידע סודי ורגיש. אף צד לא יגלה מידע זה לצד שלישי כלשהו ללא אישור מראש ובכתב מהצד השני. סעיף זה יעמוד בתוקפו גם לאחר סיום ההסכם ללא מגבלת זמן.

פרק ד: תמורה ותנאי תשלום
1. הלקוח ישלם לספק את התמורה המוסכמת כנגד המצאת חשבונית מס כחוק, וזאת בתוך 30 ימי עסקים ממועד הגשתה.
2. איחור בתשלום כלשהו מעבר ל-14 ימים יגרור ריבית פיגורים בשיעור המקובל בבנקים המסחריים בישראל.

פרק ה: ביטול ההסכם, הפרות וסעדים
1. כל צד יהיה רשאי להביא הסכם זה לידי סיום בהודעה מוקדמת בכתב של 30 ימים מראש.
2. הפרה של סעיף יסודי בהסכם זה שלא תתוקן תוך 7 ימי עבודה ממועד קבלת התראה בכתב, תהווה עילה לביטול מיידי ולתביעת פיצויים בגין כל נזק ישיר או עקיף שייגרם.

פרק ו: שונות וסמכות שיפוט
1. כל שינוי או תיקון להסכם זה יהיה בתוקף רק אם נעשה בכתב ונחתם על ידי שני הצדדים.
2. הסכם זה מבטל כל מצג, הבנה או הסכמה קודמת שנעשתה בעל פה או בכתב לפני מועד חתימתו.
3. סמכות השיפוט הבלעדית בכל מחלוקת הנובעת מהסכם זה תהיה נתונה לבתי המשפט המוסמכים בעיר תל אביב-יפו.

ולראיה באו הצדדים על החתום במועד האמור לעיל:

___________________                   ___________________
     צד א' - הספק                           צד ב' - הלקוח"#,
            desc = desc,
            clean_title = clean_title
        )
    } else if filename.contains("tviah")
        || filename.contains("court")
        || filename.contains("warrant")
        || filename.contains("ruling")
        || filename.contains("report")
        || filename.contains("tviah_rashlanut")
    {
        // Legal Pleadings / Court documents
        format!(
            r#"בבית משפט השלום
=====================================
בתיק אזרחי / פלילי מספר: 1024-06-26

בעניין שבין:
התובע / המבקש
לבין:
הנתבע / המשיב

נושא ההליך והרקע המשפטי: {clean_title}

כתב טענות מפורט ונימוקים:
1. התובע מתכבד להגיש לבית המשפט הנכבד את כתב הטענות הרלוונטי לצורך בירור העובדות והכרעה בסכסוך דנא.
2. מהות העניין והאירועים העומדים בבסיס התביעה/הבקשה: {desc}.
3. המעשים והמחדלים המיוחסים לנתבע מהווים עילה משפטית מובהקת בנזיקין, בהפרת חוזה או בחוק הרלוונטי.
4. כתוצאה מהאירועים המתוארים, נגרמו לתובע נזקים חמורים ומוכחים המפורטים בחוות הדעת הרפואית או החשבונאית המצורפת כחלק בלתי נפרד מכתב זה.

פירוט הטיעונים והראיות:
א. הנתבע התרשל בתפקידו ופעל בחוסר מקצועיות ובניגוד לחובת הזהירות המוטלת עליו על פי דין.
ב. קיים קשר סיבתי ישיר בין רשלנותו והתנהגותו של הנתבע לבין הנזקים הכבדים שנגרמו לתובע בפועל.
ג. התובע פנה לנתבע מספר פעמים בניסיון ליישב את המחלוקת מחוץ לכותלי בית המשפט, אך פניותיו נדחו או שלא נענו כלל.

הסעדים המבוקשים:
לאור האמור לעיל, מתבקש בית המשפט הנכבד להורות כדלקמן:
1. לחייב את הנתבע לפצות את התובע בגין מלוא נזקיו הישירים, עוגמת הנפש, ואובדן ההכנסה שנגרמו לו.
2. להשית על הנתבע את הוצאות המשפט ושכר טרחת עורך דין בתוספת מע"מ כחוק.
3. ליתן כל סעד אחר שבית המשפט הנכבד ימצא לנכון וצודק בנסיבות העניין.

בכבוד רב ובאמצעות בא כוחו,
עורך דין מייצג

תאריך הגשה: 26 ביוני 2024"#,
            clean_title = clean_title,
            desc = desc
        )
    } else if filename.contains("tzavaah") || filename.contains("will") {
        // Wills & Testaments
        format!(
            r#"צוואה אחרונה בהחלט
=====================================
לפי חוק הירושה, התשכ"ה-1965

אני החתום מטה, מצהיר ומצווה בזאת כדלקמן:

1. צוואה זו נעשית מרצוני החופשי, הדעה הצלולה והמלאה, ללא כל כפייה, אונס, השפעה בלתי הוגנת או לחץ מצד גורם כלשהו.
2. נושא הצוואה ופירוט הרצונות וההנחיות: {clean_title}.
3. תיאור כללי של הרכוש והחלקים לחלוקה: {desc}.
4. אני מבטל בזאת כל צוואה קודמת, הסדרים או הנחיות שניתנו על ידי לפני מועד חתימת צוואה זו.

חלוקת העיזבון והנכסים:
א. אני מורה כי כל הנדל"ן, חשבונות הבנק, ניירות הערך והזכויות הפיננסיות שבבעלותי במועד פטירתי יחולקו ליורשים החוקיים המפורטים להלן.
ב. במקרה שמי מהיורשים המנויים לא יהיה בחיים במועד פטירתי, חלקו בעיזבון יעבור לילדיו בחלקים שווים.
ג. חפצים אישיים בעלי ערך רגשי יחולקו בהתאם לרשימה המצורפת לצוואה זו.

הנחיות מיוחדות לביצוע:
1. אני ממנה את עורך דיני לשמש כמנהל העיזבון לצורך פיקוח על מימוש והוצאה לפועל של כל הוראותיי המפורטות בצוואה זו.
2. מנהל העיזבון יהיה מוסמך לפעול מול כל הגופים הפיננסיים, הבנקים, רשויות המס ולשכות רישום המקרקעין.

ולראיה באתי על החתום בפני העדים המאשרים כי חתמתי על צוואה זו מרצוני החופשי ובדעה צלולה:

___________________
      המצווה

הצהרת העדים:
אנו החתומים מטה מאשרים בזאת כי המצווה חתם על צוואה זו בפנינו, לאחר שהצהיר כי זו צוואתו האחרונה וכי הוא מבין את תוכנה ומשמעותה במלואה.

___________________                  ___________________
       עד 1                                   עד 2"#,
            clean_title = clean_title,
            desc = desc
        )
    } else {
        // Letters, memos, other formal correspondence
        format!(
            r#"פנייה ורשומה רשמית
=====================================
מאת: השולח המורשה
אל: הנמען המיועד

נושא הפנייה: {clean_title}

תוכן הפנייה ופרטים רלוונטיים:
1. מכתב זה נכתב ונשלח בהמשך לפגישות, שיחות והבנות קודמות שהושגו בין הצדדים לאחרונה.
2. תיאור העובדות והעניין הרלוונטי לפעולה מיידית: {desc}.
3. המידע המובא במסגרת פנייה זו הינו מהותי ודורש התייחסות, בירור או פתרון מעשי בהקדם האפשרי.

פירוט הסוגיה והשלכותיה:
א. הנושא הנדון משפיע ישירות על התקדמות העבודה המשותפת והשגת היעדים המוגדרים של הפרויקט.
ב. נבקשכם לבדוק את הנתונים המצורפים, לאשר את נכונותם או להציע פתרון חלופי אם יש צורך בכך.
ג. במידה ונדרש תיאום מיוחד או פגישת עבודה לצורך הבהרת הדברים, אנא הודיעונו בהקדם.

הנחיות וצעדים לביצוע:
1. נבקש לקבל מענה רשמי ובכתב לפנייה זו בתוך 7 ימי עבודה ממועד קבלתה.
2. יש לפעול בהתאם לנהלי העבודה המקובלים בחברה ולעדכן את כל הגורמים המעורבים בעדכונים השוטפים.

בברכה ובכבוד רב,
הגורם השולח

תאריך: 26 ביוני 2024"#,
            clean_title = clean_title,
            desc = desc
        )
    }
}

fn get_few_shot_template(doc_type: &str) -> Option<&'static str> {
    match doc_type {
        "contract" => Some(r#"משרד המשפטים/הרשות לרישום והסדר מקרקעין
שטר לפעולות שכירות במקרקעי ישראל
הואיל והמשכיר הינו הבעלים של המקרקעין המפורטים להלן, מבוקש לבצע: רישום זכות חכירה.
1. הצדדים:
   - המשכיר: [שם המשכיר / רשות מקרקעי ישראל]
   - השוכר/ים: [שם השוכר], ת.ז/ח.פ: [מספר זיהוי]
2. תיאור המקרקעין:
   - גוש: [מספר], חלקה: [מספר], תת-חלקה: [מספר], ישוב: [שם הישוב]
3. תנאי השכירות:
   - תקופת השכירות: [מספר] שנים, החל מיום [תאריך] ועד יום [תאריך].
   - דמי השכירות והוראות פיננסיות יהיו בהתאם לנספח תנאי השכירות המצורף לשטר זה.
4. חתימות ואישורים:
   - חתימת המשכיר: [חתימה] | חתימת השוכר: [חתימה]
   - אישור עו"ד: הריני לאשר כי הצדדים התייצבו בפניי וחתמו מרצונם החופשי."#),
        "will" => Some(r#"תצהיר משפטי מאומת:
אני הח"מ, עו"ד [שם עו"ד], מ.ר. [מספר רישיון], לאחר שהוזהרתי כי עלי לומר את האמת וכי אהיה צפוי לעונשים בחוק אם לא אעשה כן, מצהיר בזה בכתב כדלקמן:
1. בדקתי את ההתחייבויות בתיקי הערות האזהרה הרשומות על המקרקעין הידועים כגוש [מספר], חלקה [מספר].
2. הריני לאשר כי הפעולה המבוקשת אינה פוגעת בזכויות הזכאים ואינה סותרת את תוכנן.
3. הנני מצהיר כי שמי הוא [שם המצהיר], החתימה למטה היא חתימתי ותוכן תצהירי זה אמת.
- תאריך: [תאריך] | חתימת המצהיר: [חתימה]
- אימות חתימה: אני עו"ד [שם], מאשר כי ביום [תאריך] הופיע בפניי המצהיר ולאחר שהזהרתיו כחוק חתם על תצהיר זה בפניי."#),
        "report" => Some(r#"בקשת רישום מקרקעין:
משרד המשפטים / הרשות לרישום והסדר זכויות מקרקעין
נושא: בקשה לרישום במקרקעין (לפי תקנות המקרקעין)
1. תיאור המקרקעין:
   - ישוב: [שם הישוב] | גוש: [מספר] | חלקה: [מספר] | תת-חלקה: [מספר]
2. הפעולה המבוקשת:
   - רישום צו ירושה / צו קיום צוואה / הסכם חלוקת עיזבון [סמן X או פרט פרטים]
3. פרטי המבקשים:
   - שם מלא / תאגיד: [שם] | מספר זיהוי: [ת.ז/ח.פ] | כתובת: [כתובת]
4. אימות חתימה:
   - אני מעיד כי היום התייצב בפניי המבקש ולאחר שזיהיתיו והסברתי לו את מהות הבקשה, חתם לפניי מרצונו."#),
        "letter" => Some(r#"מכתב דרישה והודעה משפטית:
מאת: עו"ד [שם עו"ד], מ.ר. [מספר רישיון]
אל: [שם הנמען] | כתובת: [כתובת]
תאריך: [תאריך]
הנדון: דרישה לתשלום והסדרת חוב בהמשך להחלטה שיפוטית

פנייה זו נשלחת אליך בהמשך לקביעה מיום [תאריך], לפיה נפסק תשלום בסך [סכום] ש"ח לטובת מר/גב' [שם הזכאי] ת"ז [מספר זיהוי].
הנך נדרש להעביר את הסכום הנ"ל בתוך 7 ימי עסקים בהעברה בנקאית לחשבון בנק [שם הבנק], סניף [מספר], חשבון [מספר].
בברכה ובכבוד רב,
עו"ד [שם עו"ד], [חתימה]"#),
        _ => None,
    }
}

fn write_docx_file(dest_docx: &Path, text: &str) -> Result<(), String> {
    let temp_txt = dest_docx.with_extension("txt");
    fs::write(&temp_txt, text).map_err(|e| format!("Failed to write temporary text: {e}"))?;

    let python_exe = "python/.venv/bin/python";
    let status = std::process::Command::new(python_exe)
        .arg("python/create_docx.py")
        .arg(&temp_txt)
        .arg(dest_docx)
        .status()
        .map_err(|e| format!("Failed to run python creator script: {e}"))?;

    let _ = fs::remove_file(&temp_txt);

    if !status.success() {
        return Err(format!("python docx compiler exited with error status: {:?}", status.code()));
    }

    Ok(())
}
