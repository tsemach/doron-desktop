// Deletes a user (by email) from the backend Postgres database.
// Called by delete-user.sh -- not meant to be run directly, since it expects
// DATABASE_URL to already be set in the environment.
//
// accounts/sessions/desktop_sessions cascade-delete automatically (FK
// onDelete: cascade on userId). verification_tokens has no FK to users
// (keyed by plain-text email), so it's cleaned up separately here.

const { Client } = require("pg");

async function main() {
  const emails = process.argv.slice(2);
  if (emails.length === 0) {
    console.error("Usage: node delete-user.js <email> [email2 ...]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();

    const users = await client.query(
      "DELETE FROM users WHERE email = ANY($1) RETURNING id, email",
      [emails]
    );
    const tokens = await client.query(
      "DELETE FROM verification_tokens WHERE identifier = ANY($1) RETURNING identifier",
      [emails]
    );

    if (users.rows.length === 0) {
      console.log("No matching users found.");
    } else {
      console.log("Deleted users:");
      for (const row of users.rows) console.log(`  - ${row.email} (${row.id})`);
    }
    if (tokens.rows.length > 0) {
      console.log("Deleted leftover verification_tokens:");
      for (const row of tokens.rows) console.log(`  - ${row.identifier}`);
    }

    const notFound = emails.filter((e) => !users.rows.some((r) => r.email === e));
    if (notFound.length > 0) {
      console.log("Not found (already absent):");
      for (const email of notFound) console.log(`  - ${email}`);
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
