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
    let out_dir = Path::new(&args.corpus_dir);
    fs::create_dir_all(out_dir).map_err(|e| format!("Failed to create corpus dir: {e}"))?;

    println!("Generating corpus in {}...", out_dir.display());

    let documents = get_corpus_templates();

    if args.ai {
        let api_key = args.api_key.unwrap_or_default();
        let model = args
            .model
            .unwrap_or_else(|| "claude-sonnet-4-6".to_string());

        let provider = get_active_provider(ProviderConfig {
            provider_type: args.provider.clone(),
            api_key,
            model,
            base_url: None,
        });

        for (filename, doc_type, desc) in &documents {
            let file_path = out_dir.join(filename);
            println!("Generating (AI) {}...", filename);

            let prompt = format!(
                "Draft a realistic, detailed Hebrew legal document or correspondence of type '{}'. Description: {}. Write only the document text in Hebrew, without any markdown formatting or meta commentaries.",
                doc_type, desc
            );

            let text = provider.call_simple(&prompt, Some("You are a helpful assistant that writes realistic dummy legal documents in Hebrew.")).await?;
            fs::write(&file_path, text)
                .map_err(|e| format!("Failed to write {}: {}", filename, e))?;
        }
    } else {
        for (filename, _, desc) in &documents {
            let file_path = out_dir.join(filename);
            let text = get_static_document_text(filename, desc);
            fs::write(&file_path, text)
                .map_err(|e| format!("Failed to write {}: {}", filename, e))?;
        }
    }

    println!(
        "\x1b[32mSuccess!\x1b[0m Generated {} files in {}",
        documents.len(),
        out_dir.display()
    );
    Ok(())
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
    // Return a detailed mock string with keywords matching the filename and description to make search work
    format!(
        "מסמך משפטי: {}\n==================================\n\nתיאור ותוכן:\n{}\n\nנערך ונחתם כחוק.\nפרטי זיהוי ומילים מפתח למטרות חיפוש מבוסס מילים ותוכן.\nשם הקובץ המקורי: {}\n\nטקסט משפטי ארוך המכיל את כל המילים החיוניות לאינדקס המערכת. כל הזכויות שמורות.",
        filename.replace(".txt", "").replace('_', " "),
        desc,
        filename
    )
}
